const catalog = require('../catalog');
const commands = require('../data/commands.json');
const { context } = require('./rhelpers');
const { Dialog } = require('./dialog');
const { FormDialog } = require('./form');
const { t } = require('./i18n');
const report = require('./report');

const STATE_FIELDS = new Set(['dataset', 'model', 'models', 'hclust']);

// Runs R Commander menu commands: ask the user for the options, generate the
// R code, and run it in the R terminal and/or insert it in the script.
class Commander {
  // host: { vscode, session, settings(resource), resource(), notify(text) }
  constructor(host) {
    this.host = host;
    this.activeDataset = undefined;
    this.activeModel = undefined;
    this.documents = {}; // report documents (R Markdown / knitr) that collect every command, by kind
    this.onChange = () => {};
  }

  title(id) {
    const label = commands[id]?.label || id;
    return t(label).replace(/\.\.\.$/, '').replace(/…$/, '');
  }

  async execute(id) {
    const { vscode, session } = this.host;
    const spec = catalog[commands[id]?.target || id];
    if (!spec) return;
    if (spec.vscode) return vscode.commands.executeCommand(spec.vscode, ...(spec.args || []));
    if (spec.url) return vscode.env.openExternal(vscode.Uri.parse(spec.url));
    if (spec.run) return spec.run(this, this.host);

    const needsDataset = spec.ds !== false;
    const needsState = needsDataset || spec.needsModel || spec.select || spec.refresh || spec.detectNew ||
      (spec.fields || []).some(f => STATE_FIELDS.has(f.type));
    const state = needsState ? await session.snapshot() : undefined;
    if (needsState && !state) {
      this.host.notify(t('R did not answer. Open an R terminal and make sure it is idle; names will be typed by hand.'), 'warn');
    }

    if (spec.select) return this.select(spec.select, state);
    if (spec.refresh) return this.refresh(state);

    let ds;
    if (needsDataset) {
      ds = await this.resolveDataset(state);
      if (!ds) return;
    }
    let model;
    if (spec.needsModel) {
      model = await this.resolveModel(state);
      if (!model) return;
    }

    // The context the commands generate code with. It is rebuilt when the data set is changed in the form.
    const makeCtx = name => {
      const c = context(name, { objects: state?.objects });
      c.model = model;
      c.cranMirror = this.host.settings().cranMirror || 'https://cloud.r-project.org';
      c.packageDownloads = this.host.settings().packageDownloads || '~/.cache/r-commander-play/packages';
      c.kindOf = v => state?.datasets[name]?.vars.find(x => x.name === v)?.kind;
      c.varNames = (state?.datasets[name]?.vars || []).map(x => x.name);
      c.nvars = state?.datasets[name]?.vars.length;
      c.nrows = state?.datasets[name]?.rows;
      c.isDiscrete = v => Boolean(state?.datasets[name]?.vars.find(x => x.name === v)?.discrete);
      c.nlevelsOf = v => state?.datasets[name]?.vars.find(x => x.name === v)?.levels;
      c.modelClass = (state?.models || []).find(m => m.name === (model || this.activeModel))?.cls;
      c.identify3d = this.identify3d;
      c.outputFile = this.outputFile;
      return c;
    };
    let ctx = makeCtx(ds);
    let currentDs = ds;
    const dialog = new Dialog({ vscode, t, state, dataset: ds, activeModel: model || this.activeModel, ctx, session });
    const title = this.title(id);
    const finish = async values => {
      const code = spec.code ? spec.code(values, ctx) : '';
      if (!code) {
        if (spec.emptyMessage) await vscode.window.showWarningMessage(t(spec.emptyMessage));
        return;
      }
      if (needsDataset && currentDs !== this.activeDataset) this.setDataset(currentDs); // the one chosen in the form
      await spec.apply?.(values, this.host); // effects outside R, e.g. saving a setting
      await this.deliver(code, spec, title);
      spec.remember?.(values, ctx, this);
      const name = spec.activeDataset?.(values);
      if (name) this.setDataset(name);
      if (spec.activeModel) this.setModel(spec.activeModel(values));
      if (spec.detectNew) {
        const after = await session.snapshot();
        const created = Object.keys(after?.datasets || {}).filter(n => !state?.datasets[n]);
        if (created.length) this.setDataset(created[0]);
      }
    };

    let values;
    const fields = spec.fields || [];
    if (!fields.length || spec.noForm?.(ctx)) {
      // Nothing to ask (or only follow-up questions): run straight away, as Rcmdr does.
      values = {};
      if (spec.after && await spec.after(values, dialog, ctx) === false) return;
    } else if (this.host.settings().dialogStyle === 'steps') {
      values = await dialog.run(spec, title);
      const problem = values && spec.check?.(values);
      if (problem) { await vscode.window.showWarningMessage(t(problem)); return; }
    } else {
      const extra = {};
      // Column names of a table that come from R (e.g. a model's coefficients).
      for (const field of fields.filter(f => f.type === 'table' && f.colsExpr)) extra[field.k] = (await session.query(field.colsExpr(ctx))) || [];
      for (const field of fields.filter(f => f.type === 'installed' || f.type === 'rlist')) {
        if (field.type === 'rlist' && field.of) continue; // filled in by the form once the file is chosen
        if (field.type === 'rlist') {
          // Some lists take a while (the packages on CRAN): show progress while R fetches them.
          const fetch = () => session.query(field.expr(ctx), field.timeout);
          const lines = (field.slow && vscode.window.withProgress
            ? await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: t(field.slow) }, fetch)
            : await fetch()) || [];
          extra[field.k] = lines;
          if (!lines.length && field.emptyMessage) {
            await (field.emptyInfo ? vscode.window.showInformationMessage : vscode.window.showWarningMessage)(t(field.emptyMessage));
            if (field.emptyStops) return;
          }
          continue;
        }
        const all = await session.query('sort(.packages(all.available = TRUE))');
        extra[field.k] = (all || []).filter(n => !field.filter || new RegExp(field.filter).test(n));
      }
      const subtitle = [ds && `${t('Data set')}: ${ds}`, model && `${t('Model')}: ${model}`].filter(Boolean).join('   ·   ');
      const datasets = needsDataset && state && Object.keys(state.datasets).length > 1
        ? Object.values(state.datasets).map(d => ({ name: d.name, description: `${d.rows} × ${d.columns}` })) : [];
      const env = { vscode, t, state, vars: state?.datasets[ds]?.vars, activeModel: model || this.activeModel, ctx, extra, subtitle, session,
        dataset: ds, datasets,
        // Choosing another data set in the form: new variables, new code context.
        switchDataset: name => {
          currentDs = name; ctx = makeCtx(name); dialog.ctx = ctx; dialog.dataset = name;
          return { vars: state.datasets[name].vars, ctx, subtitle: [`${t('Data set')}: ${name}`, model && `${t('Model')}: ${model}`].filter(Boolean).join('   ·   ') };
        } };
      values = await (this.host.form || new FormDialog(env)).run(spec, title, dialog, finish, env);
    }
    if (!values) return;
    await finish(values);
  }

  async deliver(code, spec, title) {
    const { vscode, session } = this.host;
    const settings = this.host.settings();
    const action = settings.menuAction;
    if (action === 'insert' || action === 'both') await this.insert(code, title);
    if (action === 'run' || action === 'both') await session.run(code, { require: spec.pkgs, settings });
    await this.addToDocuments(code, title);
  }

  // ---- R Markdown / knitr documents -------------------------------------------------------------
  // "Edit R Markdown document" / "Edit knitr document" start a document next to the script; from then on
  // every command also adds its title and code block to it, as in Rcmdr.
  async startDocument(kind) {
    const { vscode } = this.host;
    const { ext, language } = report.KINDS[kind];
    const script = this.host.resource();
    let doc = this.documents[kind] && vscode.workspace.textDocuments.find(d => d.uri.toString() === this.documents[kind].toString());
    if (!doc) {
      if (script?.scheme === 'file') {
        const uri = vscode.Uri.file(script.fsPath.replace(/\.[^./\\]*$/, '') + `.${ext}`);
        try { await vscode.workspace.fs.stat(uri); } catch { await vscode.workspace.fs.writeFile(uri, Buffer.from(report.template(kind), 'utf8')); }
        doc = await vscode.workspace.openTextDocument(uri);
      } else {
        doc = await vscode.workspace.openTextDocument({ language, content: report.template(kind) });
      }
      this.documents[kind] = doc.uri;
    }
    await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true });
    this.host.notify(t('The {0} document collects the commands you run.', ext), 'info');
  }

  documentOf(kind) {
    const { vscode } = this.host;
    const uri = this.documents[kind];
    return uri && vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString());
  }

  async rewrite(doc, text) {
    const { vscode } = this.host;
    const edit = new vscode.WorkspaceEdit();
    edit.replace(doc.uri, new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length)), text);
    await vscode.workspace.applyEdit(edit);
  }

  async addToDocuments(code, title) {
    for (const kind of Object.keys(this.documents)) {
      const doc = this.documentOf(kind);
      if (doc) await this.rewrite(doc, report.append(kind, doc.getText(), title, code));
    }
  }

  // what: 'block' (the last command block and its title) or 'title' (only the last section title).
  async removeFromDocument(kind, what) {
    const doc = this.documentOf(kind);
    if (!doc) { this.host.notify(t('There is no {0} document yet. Use Edit > Edit R Markdown / knitr document first.', report.KINDS[kind].ext), 'warn'); return; }
    const text = doc.getText();
    const next = what === 'title' ? report.removeLastTitle(kind, text) : report.removeLastBlock(kind, text);
    if (next !== text) await this.rewrite(doc, next);
  }

  async insert(code, title) {
    const { vscode } = this.host;
    const uri = this.host.resource();
    const editor = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === uri?.toString()) || vscode.window.activeTextEditor;
    // The form (and the plot viewer a graph opens) can hide the script, so it may not be a visible editor:
    // then the document is edited directly.
    const doc = editor?.document.languageId === 'r' ? editor.document
      : uri && vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString());
    if (!doc || doc.languageId !== 'r') return;
    const end = doc.lineAt(doc.lineCount - 1).range.end;
    const prefix = doc.getText().trim() === '' ? '' : (end.character === 0 ? '\n' : '\n\n');
    const text = `${prefix}# ${title}\n${code}\n`;
    if (editor?.document === doc) { await editor.edit(edit => edit.insert(end, text)); return; }
    const edit = new vscode.WorkspaceEdit();
    edit.insert(doc.uri, end, text);
    await vscode.workspace.applyEdit(edit);
  }

  async resolveDataset(state) {
    const { vscode } = this.host;
    if (!state) {
      if (this.activeDataset) return this.activeDataset;
      return vscode.window.showInputBox({ title: t('Active data set'), prompt: t('Name of the data set in the R session'), ignoreFocusOut: true });
    }
    const names = Object.keys(state.datasets);
    if (!names.length) {
      vscode.window.showWarningMessage(t('There is no data set in the R session. Use Data > Load data set, Import data or New data set first.'));
      return undefined;
    }
    if (this.activeDataset && names.includes(this.activeDataset)) return this.activeDataset;
    const chosen = names.length === 1 ? names[0] : await this.pickDataset(names, state);
    if (chosen) this.setDataset(chosen);
    return chosen;
  }

  async resolveModel(state) {
    const { vscode } = this.host;
    if (!state) return this.activeModel || vscode.window.showInputBox({ title: t('Active model'), prompt: t('Name of the model in the R session'), ignoreFocusOut: true });
    if (!state.models.length) {
      vscode.window.showWarningMessage(t('There is no model in the R session. Fit one first (Statistics > Fit models).'));
      return undefined;
    }
    if (this.activeModel && state.models.some(m => m.name === this.activeModel)) return this.activeModel;
    const chosen = state.models.length === 1 ? state.models[0].name : await this.pickModel(state);
    if (chosen) this.setModel(chosen);
    return chosen;
  }

  async pickDataset(names, state) {
    const items = names.map(n => ({ label: n, description: `${state.datasets[n].rows} × ${state.datasets[n].columns}` }));
    return (await this.host.vscode.window.showQuickPick(items, { title: t('Select active data set'), ignoreFocusOut: true }))?.label;
  }

  async pickModel(state) {
    const items = state.models.map(m => ({ label: m.name, description: m.cls }));
    return (await this.host.vscode.window.showQuickPick(items, { title: t('Select active model'), ignoreFocusOut: true }))?.label;
  }

  async select(kind, state) {
    if (!state) return;
    if (kind === 'dataset') {
      const names = Object.keys(state.datasets);
      if (!names.length) return this.host.vscode.window.showWarningMessage(t('There is no data set in the R session. Use Data > Load data set, Import data or New data set first.'));
      const first = names.includes(this.activeDataset) ? [this.activeDataset, ...names.filter(n => n !== this.activeDataset)] : names;
      const chosen = await this.pickDataset(first, state);
      if (chosen) this.setDataset(chosen);
    } else {
      if (!state.models.length) return this.host.vscode.window.showWarningMessage(t('There is no model in the R session. Fit one first (Statistics > Fit models).'));
      const chosen = await this.pickModel(state);
      if (chosen) this.setModel(chosen);
    }
  }

  async refresh(state) {
    if (!state) return;
    const ds = state.datasets[this.activeDataset];
    this.host.notify(ds ? t('{0}: {1} rows, {2} columns.', this.activeDataset, ds.rows, ds.columns)
      : t('{0} data set(s) in the R session.', Object.keys(state.datasets).length), 'info');
    this.onChange();
  }

  setDataset(name) { this.activeDataset = name; this.onChange(); }
  setModel(name) { this.activeModel = name; this.onChange(); }
}

module.exports = { Commander };

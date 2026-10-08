const catalog = require('../catalog');
const commands = require('../data/commands.json');
const { context } = require('./rhelpers');
const { Dialog } = require('./dialog');
const { FormDialog } = require('./form');
const { t } = require('./i18n');

const STATE_FIELDS = new Set(['dataset', 'model', 'models', 'hclust']);

// Runs R Commander menu commands: ask the user for the options, generate the
// R code, and run it in the R terminal and/or insert it in the script.
class Commander {
  // host: { vscode, session, settings(resource), resource(), notify(text) }
  constructor(host) {
    this.host = host;
    this.activeDataset = undefined;
    this.activeModel = undefined;
    this.onChange = () => {};
  }

  title(id) {
    const label = commands[id]?.label || id;
    return t(label).replace(/\.\.\.$/, '').replace(/…$/, '');
  }

  async execute(id) {
    const { vscode, session } = this.host;
    const spec = catalog[id];
    if (!spec) return;
    if (spec.vscode) return vscode.commands.executeCommand(spec.vscode, ...(spec.args || []));
    if (spec.url) return vscode.env.openExternal(vscode.Uri.parse(spec.url));

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

    const ctx = context(ds, { objects: state?.objects });
    ctx.model = model;
    ctx.kindOf = name => state?.datasets[ds]?.vars.find(v => v.name === name)?.kind;
    const dialog = new Dialog({ vscode, t, state, dataset: ds, activeModel: model || this.activeModel, ctx, session });
    const title = this.title(id);
    const finish = async values => {
      const code = spec.code ? spec.code(values, ctx) : '';
      if (!code) return;
      await this.deliver(code, spec, title);
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
    if (!fields.length) {
      // Nothing to ask (or only follow-up questions): run straight away, as Rcmdr does.
      values = {};
      if (spec.after && await spec.after(values, dialog, ctx) === false) return;
    } else if (this.host.settings().dialogStyle === 'steps') {
      values = await dialog.run(spec, title);
    } else {
      const extra = {};
      for (const field of fields.filter(f => f.type === 'installed' || f.type === 'rlist')) {
        if (field.type === 'rlist' && field.of) continue; // filled in by the form once the file is chosen
        if (field.type === 'rlist') { extra[field.k] = (await session.query(field.expr(ctx))) || []; continue; }
        const all = await session.query('sort(.packages(all.available = TRUE))');
        extra[field.k] = (all || []).filter(n => !field.filter || new RegExp(field.filter).test(n));
      }
      const subtitle = [ds && `${t('Data set')}: ${ds}`, model && `${t('Model')}: ${model}`].filter(Boolean).join('   ·   ');
      const env = { vscode, t, state, vars: state?.datasets[ds]?.vars, activeModel: model || this.activeModel, ctx, extra, subtitle, session };
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
  }

  async insert(code, title) {
    const { vscode } = this.host;
    const uri = this.host.resource();
    const editor = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === uri?.toString()) || vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'r') return;
    const doc = editor.document;
    const end = doc.lineAt(doc.lineCount - 1).range.end;
    const prefix = doc.getText().trim() === '' ? '' : (end.character === 0 ? '\n' : '\n\n');
    await editor.edit(edit => edit.insert(end, `${prefix}# ${title}\n${code}\n`));
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

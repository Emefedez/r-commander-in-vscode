const { isNumber, isNumericExpression, splitList, isSyntactic } = require('./rhelpers');

const FACTORLIKE = ['factor', 'character', 'logical'];
const KINDS = {
  numeric: v => v.kind === 'numeric',
  factor: v => FACTORLIKE.includes(v.kind),
  twolevel: v => FACTORLIKE.includes(v.kind) && v.levels === 2,
  discrete: v => v.kind === 'numeric' && v.discrete,
  any: () => true
};
const NONE = Symbol('none');

// Asks the fields of a command one by one with quick picks and input boxes.
// Returns the collected values, or undefined when the user cancels.
class Dialog {
  // env: { vscode, t, state, dataset, activeModel, ctx, session }
  constructor(env) { Object.assign(this, env); }

  get vars() { return this.state?.datasets[this.dataset]?.vars; }

  async run(command, title) {
    this.title = title;
    const values = {};
    const fields = command.fields || [];
    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];
      if (field.when && !field.when(values)) continue;
      this.step = `${i + 1}/${fields.length}`;
      const answer = await this.field(field, values);
      if (answer === undefined) return undefined;
      values[field.k] = answer === NONE ? undefined : answer;
    }
    if (command.after) {
      const ok = await command.after(values, this, this.ctx);
      if (ok === false) return undefined;
    }
    return values;
  }

  heading() { return this.step ? `${this.title} (${this.step})` : this.title; }

  async field(field, values) {
    const { t } = this;
    const label = t(field.label || field.k);
    switch (field.type) {
      case 'var': return this.variable(field, label, values);
      case 'dataset': return this.pickOne(label, Object.keys(this.state?.datasets || {}).map(n => ({ label: n })), field);
      case 'model': return this.pickOne(label, (this.state?.models || []).map(m => ({ label: m.name, description: m.cls })), field, this.activeModel);
      case 'models': {
        const picked = await this.pickMany(label, (this.state?.models || []).map(m => ({ label: m.name, description: m.cls })), { min: 2 });
        return picked?.map(p => p.label);
      }
      case 'hclust': return this.pickOne(label, (this.state?.hclusts || []).map(n => ({ label: n })), field);
      case 'name': return this.text({
        label, def: typeof field.def === 'function' ? field.def(this.ctx, values) : field.def,
        validate: v => isSyntactic(v.trim()) ? undefined : t('Enter a valid R name (letters, digits, . and _; not starting with a digit).')
      }).then(v => v?.trim());
      case 'text': return this.text({
        label, def: typeof field.def === 'function' ? field.def(this.ctx, values) : field.def,
        validate: v => field.optional || v.trim() !== '' ? (field.pattern && v.trim() && !field.pattern.test(v) ? t(field.error || 'Invalid value.') : undefined) : t('A value is required.')
      });
      case 'num': return this.text({
        label, def: field.def, validate: v => {
          if (!isNumericExpression(v)) return t('Enter a number.');
          const n = Number(v);
          if (field.int && !Number.isInteger(n)) return t('Enter a whole number.');
          if (field.min !== undefined && n < field.min) return t('The value must be at least {0}.', field.min);
          if (field.max !== undefined && n > field.max) return t('The value must be at most {0}.', field.max);
          return undefined;
        }
      });
      case 'numlist': return this.text({
        label, def: field.def,
        validate: v => splitList(v).length && splitList(v).every(isNumericExpression) ? undefined : t('Enter numbers separated by commas.')
      }).then(v => v === undefined ? v : splitList(v));
      case 'choice': {
        const choices = typeof field.choices === 'function' ? field.choices(values) : field.choices;
        const items = choices.map(([value, text]) => ({ label: t(text), value }));
        return this.pickOne(label, items, field, undefined, field.def || 0);
      }
      case 'flags': {
        const items = field.items.map(([key, text, on]) => ({ label: t(text), key, picked: on }));
        const picked = await this.pickMany(label, items, { ...field, min: 0 });
        if (!picked) return undefined;
        const keys = new Set(picked.map(p => p.key));
        return Object.fromEntries(field.items.map(([key]) => [key, keys.has(key)]));
      }
      case 'rlist': {
        const lines = (await this.query(field.of ? field.exprFor(values[field.of], this.ctx) : field.expr(this.ctx))) || [];
        if (!lines.length) { await this.vscode.window.showWarningMessage(t('Nothing to choose from: {0}', label)); return undefined; }
        const items = lines.map(l => { const [name, description] = l.split('\t'); return { label: name, description }; });
        const picked = await this.pickMany(label, items, field);
        return picked?.map(p => p.label);
      }
      case 'matrix': {
        const levels = (await this.query(`levels(as.factor(${this.ctx.dv(values[field.of])}))`)) || [];
        const rows = levels.map(() => []);
        for (let j = 1; j < levels.length; j++) {
          const text = await this.text({ label: `${t('Contrast {0}: one number per level', j)} (${levels.join(', ')})`, def: levels.map(() => '0').join(', '),
            validate: v => v.split(',').length === levels.length && v.split(',').every(x => isNumericExpression(x.trim())) ? undefined : t('Enter {0} numbers separated by commas.', levels.length) });
          if (text === undefined) return undefined;
          text.split(',').forEach((x, i) => rows[i].push(x.trim()));
        }
        return { levels, rows };
      }
      case 'installed': {
        const all = await this.session.query('sort(.packages(all.available = TRUE))');
        const names = (all || []).filter(n => !field.filter || new RegExp(field.filter).test(n));
        if (!names.length) {
          await this.vscode.window.showWarningMessage(t('No packages found.'));
          return undefined;
        }
        const picked = await this.pickMany(label, names.map(n => ({ label: n })), field);
        return picked?.map(p => p.label);
      }
      case 'levelorder': {
        const levels = (await this.query(`levels(as.factor(${this.ctx.dv(values[field.of])}))`)) || [];
        const text = await this.text({ label: `${label} (${t('separated by commas')})`, def: levels.join(', '),
          validate: v => {
            const given = v.split(',').map(s => s.trim()).filter(Boolean);
            return levels.length && (given.length !== levels.length || new Set(given).size !== given.length || given.some(g => !levels.includes(g)))
              ? t('Use each level exactly once.') : undefined;
          } });
        return text === undefined ? undefined : text.split(',').map(s => s.trim()).filter(Boolean);
      }
      case 'renames': {
        const picked = await this.pickMany(label, (this.vars || []).map(v => ({ label: v.name })), { min: 1 });
        if (!picked) return undefined;
        const pairs = [];
        for (const { label: old } of picked) {
          const next = await this.text({ label: t('New name for {0}', old), def: old, validate: v => isSyntactic(v.trim()) ? undefined : t('Enter a valid R name (letters, digits, . and _; not starting with a digit).') });
          if (next === undefined) return undefined;
          if (next.trim() !== old) pairs.push([old, next.trim()]);
        }
        return pairs;
      }
      case 'file': return this.file(field, label);
      case 'dir': return this.dir(field, label);
      default: throw new Error(`Unknown field type ${field.type}`);
    }
  }

  async variable(field, label, values) {
    const { t } = this;
    const taken = new Set((field.exclude || []).flatMap(k => [].concat(values[k] || [])));
    if (!this.vars) return this.manualVariable(field, label);
    const filter = KINDS[field.kind || 'any'];
    const candidates = this.vars.filter(v => filter(v) && !taken.has(v.name));
    const needed = field.multi ? field.min ?? 1 : (field.optional ? 0 : 1);
    if (candidates.length < needed) {
      await this.vscode.window.showWarningMessage(t(KINDMESSAGE[field.kind || 'any'], needed));
      return undefined;
    }
    const items = candidates.map(v => ({ label: v.name, description: describe(v, t), name: v.name }));
    if (field.multi) {
      const picked = await this.pickMany(label, items, field);
      return picked?.map(p => p.name);
    }
    if (field.optional) items.unshift({ label: t('(none)'), name: NONE });
    const chosen = await this.pickOne(label, items, field);
    return chosen === undefined ? undefined : (chosen?.name ?? chosen);
  }

  async manualVariable(field, label) {
    const { t } = this;
    const text = await this.text({
      label: `${label} — ${t('R did not answer; type variable names separated by commas')}`, def: '',
      validate: v => field.optional || v.trim() ? undefined : t('A value is required.')
    });
    if (text === undefined) return undefined;
    const names = text.split(',').map(s => s.trim()).filter(Boolean);
    if (!names.length) return field.multi ? [] : NONE;
    return field.multi ? names : names[0];
  }

  async pickOne(label, items, field, preferred, defIndex = 0) {
    const { t } = this;
    if (!items.length) {
      await this.vscode.window.showWarningMessage(t('Nothing to choose from: {0}', label));
      return undefined;
    }
    const ordered = items.slice();
    const favourite = ordered.findIndex(i => i.label === preferred);
    const start = favourite >= 0 ? favourite : defIndex;
    if (start > 0 && start < ordered.length) ordered.unshift(...ordered.splice(start, 1));
    const picked = await this.vscode.window.showQuickPick(ordered, {
      title: this.heading(), placeHolder: label, ignoreFocusOut: true, matchOnDescription: true
    });
    if (!picked) return undefined;
    return 'value' in picked ? picked.value : (picked.name === NONE ? NONE : picked.label);
  }

  async pickMany(label, items, field) {
    const { t } = this;
    const min = field.min ?? 1;
    for (;;) {
      const picked = await this.vscode.window.showQuickPick(items.map(i => ({ ...i })), {
        title: this.heading(), placeHolder: min > 1 ? `${label} — ${t('pick at least {0}', min)}` : label,
        canPickMany: true, ignoreFocusOut: true, matchOnDescription: true
      });
      if (!picked) return undefined;
      if (picked.length >= min && (!field.max || picked.length <= field.max) && !(field.minOrNone && picked.length > 0 && picked.length < field.minOrNone)) return picked;
      await this.vscode.window.showWarningMessage(field.max && picked.length > field.max
        ? t('Pick at most {0}.', field.max) : t('Pick at least {0}.', Math.max(min, field.minOrNone || 0)));
    }
  }

  text({ label, def, validate }) {
    return this.vscode.window.showInputBox({
      title: this.heading(), prompt: label, value: def === undefined ? '' : String(def),
      ignoreFocusOut: true, validateInput: validate
    });
  }

  async file(field, label) {
    const { window, workspace, Uri } = this.vscode;
    const filters = field.filters ? Object.fromEntries(Object.entries(field.filters).map(([k, v]) => [this.t(k), v])) : undefined;
    const base = workspace.workspaceFolders?.[0]?.uri;
    const picked = field.mode === 'save'
      ? await window.showSaveDialog({ title: label, filters, defaultUri: base && Uri.joinPath(base, field.def || '') })
      : (await window.showOpenDialog({ title: label, filters, canSelectMany: false, defaultUri: base }))?.[0];
    return picked?.fsPath;
  }

  async dir(field, label) {
    const picked = await this.vscode.window.showOpenDialog({
      title: label, canSelectFolders: true, canSelectFiles: false, canSelectMany: false,
      defaultUri: this.vscode.workspace.workspaceFolders?.[0]?.uri
    });
    return picked?.[0]?.fsPath;
  }

  // For commands that need to ask more after the declarative fields.
  pick(label, items, many = false) {
    return many ? this.pickMany(label, items, { min: 1 }) : this.pickOne(label, items, {});
  }
  query(expression) { return this.session.query(expression); }
}

const KINDMESSAGE = {
  numeric: 'This command needs {0} numeric variable(s) in the active data set.',
  factor: 'This command needs {0} factor variable(s) in the active data set.',
  twolevel: 'This command needs {0} two-level factor variable(s) in the active data set.',
  discrete: 'This command needs {0} discrete numeric variable(s) in the active data set.',
  any: 'This command needs {0} variable(s) in the active data set.'
};

function describe(v, t) {
  if (FACTORLIKE.includes(v.kind) && v.levels) return `${v.kind} · ${v.levels} ${t('levels')}`;
  return v.kind;
}

module.exports = { Dialog, NONE, KINDS, describe, FACTORLIKE };

// The logic of the single-window form, independent of VS Code so it can be tested:
// initial values, which fields are visible, the lists each field offers, validation
// and conversion of what the form holds into the values the commands expect.
const { isNumericExpression, splitList, isSyntactic } = require('./rhelpers');
const { KINDS, describe } = require('./dialog');

// Rank of a small matrix (Gaussian elimination), to check contrasts are independent.
function rank(rows) {
  const m = rows.map(r => r.slice());
  let rk = 0;
  for (let c = 0; c < (m[0] || []).length && rk < m.length; c++) {
    let pivot = rk;
    for (let r = rk + 1; r < m.length; r++) if (Math.abs(m[r][c]) > Math.abs(m[pivot][c])) pivot = r;
    if (Math.abs(m[pivot][c]) < 1e-9) continue;
    [m[rk], m[pivot]] = [m[pivot], m[rk]];
    for (let r = rk + 1; r < m.length; r++) {
      const f = m[r][c] / m[rk][c];
      for (let k = c; k < m[r].length; k++) m[r][k] -= f * m[rk][k];
    }
    rk++;
  }
  return rk;
}

const evalDefault = (def, ctx, values) => {
  if (typeof def !== 'function') return def;
  try { return def(ctx, values); } catch { return ''; }
};
const names = text => String(text || '').split(',').map(s => s.trim()).filter(Boolean);

// env: { t, state, vars, activeModel, ctx, extra }
function items(field, values, env) {
  const { state } = env;
  switch (field.type) {
    case 'var': {
      if (!env.vars) return null; // R did not answer: free text instead of a list
      const taken = new Set((field.exclude || []).flatMap(k => [].concat(values[k] || [])));
      return env.vars.filter(v => KINDS[field.kind || 'any'](v) && !taken.has(v.name))
        .map(v => ({ value: v.name, label: v.name, description: describe(v, env.t) }));
    }
    case 'dataset': return Object.keys(state?.datasets || {}).map(n => ({ value: n, label: n, description: `${state.datasets[n].rows} × ${state.datasets[n].columns}` }));
    case 'model': case 'models': return (state?.models || []).map(m => ({ value: m.name, label: m.name, description: m.cls }));
    case 'hclust': return (state?.hclusts || []).map(n => ({ value: n, label: n }));
    case 'renames': return env.vars ? env.vars.map(v => ({ value: v.name, label: v.name })) : null;
    // Lines coming from R are "value" or "value<TAB>description". With labelColumn 2 the text shown is the
    // second column and the value (e.g. a URL) is the description, as in the mirror lists of R's own GUIs.
    case 'installed': case 'rlist': return field.of ? [] : (env.extra?.[field.k] || []).map(line => {
      const [value, description] = String(line).split('\t');
      return field.labelColumn === 2 && description ? { value, label: description, description: value } : { value, label: value, description };
    });
    // The variables of a model formula, marked "[factor]" as in Rcmdr.
    case 'formula': return env.vars ? env.vars.map(v => ({ value: v.name, label: ['factor', 'ordered', 'character', 'logical'].includes(v.kind) ? `${v.name} [${env.t('factor')}]` : v.name })) : [];
    case 'choice': {
      const choices = typeof field.choices === 'function' ? field.choices(values) : field.choices;
      return choices.map(([value, text]) => ({ value, label: env.t(text) }));
    }
    default: return undefined;
  }
}

// One field's raw form value as the value commands receive.
function convert(f, v) {
  switch (f.type) {
    case 'var':
      return f.multi ? (Array.isArray(v) ? v : names(v)) : (Array.isArray(v) ? v[0] : String(v || '').trim()) || undefined;
    case 'models': case 'installed': case 'rlist': return Array.isArray(v) ? v : (v ? [v] : []);
    case 'name': return String(v || '').trim();
    case 'numlist': return splitList(String(v || ''));
    // Table fields hold {row: typed text}. A level order becomes the level names
    // sorted by the position typed next to each; renames become [old, new] pairs.
    // A coefficient matrix is held as [[row name, [cells]], ...] to keep the rows in order.
    case 'matrix': return { levels: (v || []).map(r => r[0]), rows: (v || []).map(r => r[1].map(x => String(x).trim())) };
    case 'levelorder': return Object.entries(v || {}).sort((a, b) => Number(a[1]) - Number(b[1])).map(e => e[0]);
    case 'renames': return Object.entries(v || {}).map(([o, n]) => [o, String(n).trim()]).filter(([o, n]) => n && n !== o);
    case 'flags': return Object.fromEntries(f.items.map(([key]) => [key, Boolean(v?.[key])]));
    case 'formula': return { lhs: String(v?.lhs ?? '').trim(), rhs: String(v?.rhs ?? '').trim() };
    case 'table': return { rows: (v?.rows || []).map(x => String(x).trim()), cols: (v?.cols || []).map(x => String(x).trim()), cells: (v?.cells || []).map(r => r.map(x => String(x).trim())), rhs: (v?.rhs || []).map(x => String(x).trim()) };
    default: return v === undefined || v === null ? '' : String(v);
  }
}

// Values of the fields that are visible, in order (a field's `when` sees the
// values of the fields before it).
function normalize(fields, raw) {
  const values = {};
  for (const f of fields) {
    if (f.type === 'note' || (f.when && !f.when(values))) continue;
    values[f.k] = convert(f, raw[f.k]);
  }
  return values;
}

function initial(fields, env) {
  const raw = {};
  for (const f of fields) {
    const values = normalize(fields, raw);
    switch (f.type) {
      case 'var': raw[f.k] = f.multi ? [] : ''; break;
      case 'models': case 'installed': raw[f.k] = []; break;
      case 'rlist': raw[f.k] = f.selectAll ? (items(f, {}, env) || []).map(i => i.value) : f.selectFirst ? (items(f, {}, env) || []).slice(0, 1).map(i => i.value) : []; break;
      case 'matrix': raw[f.k] = []; break;
      case 'model': raw[f.k] = (items(f, values, env) || []).some(i => i.value === env.activeModel) ? env.activeModel : ''; break;
      case 'dataset': case 'hclust': case 'file': case 'dir': raw[f.k] = ''; break;
      case 'levelorder': case 'renames': raw[f.k] = {}; break;
      case 'name': case 'text': raw[f.k] = String(evalDefault(f.def, env.ctx, values) ?? ''); break;
      // Not shown: a value from the context (e.g. the active model's class) that other fields' `when` can use.
      case 'hidden': raw[f.k] = String(evalDefault(f.def, env.ctx, values) ?? ''); break;
      case 'num': case 'numlist': raw[f.k] = String(f.def ?? ''); break;
      case 'choice': { const list = items(f, values, env); const def = f.defFor ? f.defFor(values) : f.def; raw[f.k] = (typeof def === 'string' ? list.find(i => i.value === def) : list[def || 0])?.value ?? list[0]?.value; break; }
      case 'table': raw[f.k] = { rows: [], cols: [], cells: [] }; break;
      case 'flags': raw[f.k] = Object.fromEntries(f.items.map(([key, , on]) => [key, Boolean(on)])); break;
      case 'formula': raw[f.k] = { lhs: '', rhs: '' }; break;
      default: raw[f.k] = '';
    }
  }
  return raw;
}

// What each field should look like for the current values.
function layout(fields, raw, env, dirty = {}) {
  const values = normalize(fields, raw);
  const before = {};
  return fields.map(f => {
    const visible = !f.when || Boolean(f.when(before));
    if (visible) before[f.k] = convert(f, raw[f.k]);
    const list = visible ? items(f, values, env) : undefined;
    const out = { k: f.k, visible, items: list };
    if ((f.type === 'levelorder' || f.type === 'matrix') && visible) out.rowsFor = before[f.of] || undefined;
    // A list that depends on another field (the objects inside the chosen file) is filled in by the form.
    if (f.type === 'rlist' && f.of && visible) out.listFor = String(before[f.of] || '');
    // A grid of counts sized by two other fields (Rcmdr's "Enter Two-Way Table").
    if (f.type === 'table' && visible) {
      const cols = f.colsExpr ? env.extra?.[f.k] || [] : null;
      out.dims = [Number(before[f.rowsOf]) || (f.rowsOf ? 2 : 1), cols ? cols.length : Number(before[f.colsOf]) || 2];
      if (cols) out.colNames = cols;
    }
    // When the choices change (a GLM's links after its family) the default comes back: defFor, or the first one.
    if (f.type === 'choice' && list && !list.some(i => i.value === raw[f.k])) out.set = (f.defFor && f.defFor(before)) || list[0]?.value;
    if ((f.type === 'name' || f.type === 'text') && typeof f.def === 'function' && !dirty[f.k]) out.set = String(evalDefault(f.def, env.ctx, values) ?? '');
    if (Array.isArray(list) && !(f.type === 'rlist' && f.of) && ['var', 'model', 'models', 'installed', 'rlist', 'dataset', 'hclust'].includes(f.type)) {
      const have = new Set(list.map(i => i.value));
      const current = raw[f.k];
      const kept = Array.isArray(current) ? current.filter(x => have.has(x)) : (have.has(current) ? current : '');
      if (JSON.stringify(kept) !== JSON.stringify(current)) out.set = kept;
    }
    return out;
  });
}

function validate(fields, raw, env) {
  const { t } = env;
  const errors = {};
  const values = {};
  for (const f of fields) {
    if (f.when && !f.when(values)) continue;
    const v = convert(f, raw[f.k]);
    values[f.k] = v;
    const fail = message => { errors[f.k] = t(message); };
    const need = f.optional ? 0 : 1;
    switch (f.type) {
      case 'var':
        if (f.multi) {
          const min = f.min ?? 1;
          if (v.length < min) errors[f.k] = t('Pick at least {0}.', min);
          else if (f.minOrNone && v.length > 0 && v.length < f.minOrNone) errors[f.k] = t('Pick at least {0}.', f.minOrNone);
          else if (f.max && v.length > f.max) errors[f.k] = t('Pick at most {0}.', f.max);
        } else if (!v && need) fail('Pick one.');
        break;
      case 'dataset': case 'model': case 'hclust': if (!v) fail('Pick one.'); break;
      case 'rlist': if (v.length < (f.min ?? 1)) errors[f.k] = t('Pick at least {0}.', f.min ?? 1); break;
      case 'matrix': {
        const n = v.levels.length;
        if (!n) { fail('Pick a factor first.'); break; }
        const cells = v.rows.flat();
        if (cells.some(x => !isNumericExpression(x))) { fail('Enter numbers in every cell.'); break; }
        const numeric = v.rows.map(r => r.map(Number));
        if (rank(numeric.map(r => [1, ...r])) < n) fail('The contrast matrix is not of full column rank.');
        break;
      }
      case 'models': if (v.length < 2) errors[f.k] = t('Pick at least {0}.', 2); break;
      case 'installed': if (v.length < 1) errors[f.k] = t('Pick at least {0}.', 1); break;
      case 'name': if (!isSyntactic(v)) fail('Enter a valid R name (letters, digits, . and _; not starting with a digit).'); break;
      case 'text':
        if (!f.optional && !v.trim()) fail('A value is required.');
        else if (f.pattern && v.trim() && !f.pattern.test(v)) errors[f.k] = t(f.error || 'Invalid value.');
        break;
      case 'num': {
        const text = raw[f.k];
        if (!isNumericExpression(String(text))) { fail('Enter a number.'); break; }
        const n = Number(text);
        if (f.int && !Number.isInteger(n)) fail('Enter a whole number.');
        else if (f.positive && !(n > 0)) fail('The value must be positive.');
        else if (f.min !== undefined && n < f.min) errors[f.k] = t('The value must be at least {0}.', f.min);
        else if (f.max !== undefined && n > f.max) errors[f.k] = t('The value must be at most {0}.', f.max);
        break;
      }
      case 'levelorder': {
        const positions = Object.values(raw[f.k] || {}).map(Number);
        const n = positions.length;
        if (!n) fail('Pick a factor first.');
        else if (positions.some(x => !Number.isInteger(x)) || new Set(positions).size !== n || Math.min(...positions) < 1 || Math.max(...positions) > n) {
          errors[f.k] = t('Use each number from 1 to {0} exactly once.', n);
        }
        break;
      }
      case 'renames': {
        if (!v.length) { fail('Change at least one name.'); break; }
        const final = new Set(Object.keys(raw[f.k] || {}));
        for (const [o, n] of v) { final.delete(o); if (!isSyntactic(n)) { errors[f.k] = t('Not a valid R name: {0}', n); break; } }
        if (!errors[f.k]) {
          const used = new Set(final);
          for (const [, n] of v) { if (used.has(n)) { errors[f.k] = t('Variable names are not unique: {0}', n); break; } used.add(n); }
        }
        break;
      }
      case 'numlist': if (!v.length || !v.every(isNumericExpression)) fail('Enter numbers separated by commas.'); break;
      case 'formula':
        if (f.hasLhs !== false && !v.lhs) fail('Left-hand side of model empty.');
        else if (!v.rhs && !f.optional) fail('Right-hand side of model empty.');
        break;
      case 'table':
        if ([...v.cells.flat(), ...v.rhs].some(x => !isNumericExpression(x))) fail('Enter numbers in every cell.');
        else if (new Set(v.rows).size !== v.rows.length) fail('Row names are not unique.');
        else if (new Set(v.cols).size !== v.cols.length) fail('Column names are not unique.');
        break;
      case 'file': case 'dir': if (!v) fail('Choose a location.'); break;
      default: break;
    }
  }
  return errors;
}

module.exports = { rank, items, convert, normalize, initial, layout, validate, evalDefault };

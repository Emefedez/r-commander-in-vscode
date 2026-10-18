const model = require('./formmodel');

const escapeHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// What the page needs to know about each field (functions stay in the extension).
function describeFields(fields, env) {
  const { t } = env;
  return fields.map(f => ({
    k: f.k, type: f.type, label: f.label === '' ? '' : t(f.label || f.k), multi: Boolean(f.multi), optional: Boolean(f.optional), filterable: Boolean(f.filterable), single: Boolean(f.single), compact: Boolean(f.compact),
    mode: f.mode, free: f.type === 'var' && !env.vars, flags: f.items?.map(([key, text]) => [key, t(text)]),
    placeholder: f.type === 'file' ? f.def || '' : '', hasLhs: f.hasLhs, showBar: Boolean(f.showBar), heading: Boolean(f.heading), rhsLabel: f.rhsLabel ? t(f.rhsLabel) : undefined, cellDefault: f.cellDefault,
    strings: f.type === 'formula' ? { vars: t('Variables (double-click to formula)'), operators: t('Operators (click to formula):  '),
      splines: t('Splines/Polynomials:\n(select variable and click)'), bs: t('B-spline\n'), ns: t('natural\nspline'), poly: t('orthogonal\npolynomial'),
      raw: t('raw\npolynomial'), df: t('df for splines: '), deg: t('deg. for polynomials: ') } : undefined
  }));
}

function html(title, subtitle, nonce, strings, datasets = [], current = '') {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style nonce="${nonce}">
  :root { color-scheme: light dark; }
  body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground);
         background: var(--vscode-editor-background); margin: 0; padding: 16px 20px 80px; }
  h1 { font-size: 1.35em; font-weight: 600; margin: 0 0 2px; }
  .sub { color: var(--vscode-descriptionForeground); margin-bottom: 14px; }
  .datasets { display: flex; gap: 8px; align-items: center; margin: -6px 0 14px; } .datasets select { width: auto; min-width: 16em; height: auto; }
  #fields { display: flex; flex-wrap: wrap; gap: 14px 22px; align-items: flex-start; max-width: 980px; }
  .field { border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 8px 10px 10px; min-width: 230px; margin: 0; }
  .field.wide { flex: 1 1 100%; }
  .field.list { flex: 0 1 300px; }
  .field.compact, .field.list.compact { min-width: 0; flex: 0 1 10.5em; padding: 4px 6px 6px; }
  select[size="1"] { height: auto; padding: 2px 4px; }
  legend, label.title { font-weight: 600; padding: 0 4px; }
  .hidden { display: none !important; }
  .note { color: var(--vscode-errorForeground, #c00); font-weight: 600; border: none; padding: 0; }
  .note.heading { color: var(--vscode-textLink-foreground); margin-top: 6px; }
  label.title { display: block; padding: 0 0 4px; }
  select, input[type=text] { width: 100%; box-sizing: border-box; background: var(--vscode-input-background); color: var(--vscode-input-foreground);
         border: 1px solid var(--vscode-input-border, var(--vscode-panel-border)); border-radius: 2px; padding: 3px 5px; font: inherit; }
  select[multiple], select[size] { height: 9.5em; padding: 0; }
  select option { padding: 2px 6px; }
  select option:checked { background: var(--vscode-list-activeSelectionBackground) linear-gradient(0deg, var(--vscode-list-activeSelectionBackground), var(--vscode-list-activeSelectionBackground)); color: var(--vscode-list-activeSelectionForeground); }
  .opt { display: flex; gap: 6px; align-items: center; padding: 2px 0; }
  .opt input { margin: 0; }
  .hint { color: var(--vscode-descriptionForeground); font-size: 0.9em; margin-top: 3px; }
  .row { display: flex; gap: 6px; } .row input { flex: 1; }
  .ops { display: flex; flex-wrap: wrap; gap: 4px; margin: 2px 0 6px; } .ops button { padding: 2px 8px; white-space: pre-line; }
  .formula-vars { flex: 0 0 15em; } .row.formula { align-items: center; margin-top: 6px; }
  .grid { display: grid; grid-template-columns: auto 1fr; gap: 3px 10px; align-items: center; max-height: 16em; overflow: auto; }
  .grid input { width: 6em; } .grid input[type=text] { width: 12em; }
  .grid .head { font-weight: 600; color: var(--vscode-descriptionForeground); }
  .matrix { display: grid; gap: 3px 10px; align-items: center; max-height: 20em; overflow: auto; }
  .matrix input { width: 5.5em; }
  .matrix .head { font-weight: 600; color: var(--vscode-descriptionForeground); }
  .err { color: var(--vscode-errorForeground); font-size: 0.92em; min-height: 0; margin-top: 3px; }
  .field.bad { border-color: var(--vscode-inputValidation-errorBorder, var(--vscode-errorForeground)); }
  footer { position: fixed; left: 0; right: 0; bottom: 0; display: flex; gap: 8px; justify-content: flex-end; align-items: center;
           padding: 10px 20px; background: var(--vscode-editor-background); border-top: 1px solid var(--vscode-panel-border); }
  footer .status { margin-right: auto; color: var(--vscode-descriptionForeground); }
  button { font: inherit; padding: 4px 14px; border: 1px solid var(--vscode-button-border, transparent); border-radius: 2px; cursor: pointer;
           background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  button.primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  button:hover { filter: brightness(1.12); } button:disabled { opacity: .5; cursor: default; }
</style></head><body>
<h1>${escapeHtml(title)}</h1><div class="sub" id="sub">${escapeHtml(subtitle)}</div>
${datasets.length > 1 ? `<div class="datasets"><label for="dsPick">${escapeHtml(strings.dataset)}</label>
<select id="dsPick">${datasets.map(d => `<option value="${escapeHtml(d.name)}"${d.name === current ? ' selected' : ''}>${escapeHtml(d.name)} — ${escapeHtml(d.description)}</option>`).join('')}</select></div>` : ''}
<div id="fields"></div>
<footer><span class="status" id="status"></span>
  <button id="reset">${escapeHtml(strings.reset)}</button><button id="cancel">${escapeHtml(strings.cancel)}</button>
  <button id="apply">${escapeHtml(strings.apply)}</button><button id="accept" class="primary">${escapeHtml(strings.accept)}</button></footer>
<script nonce="${nonce}">
const api = acquireVsCodeApi();
const S = ${JSON.stringify(strings)};
let schema = [], widgets = {}, dirty = {}, timer;
const $ = id => document.getElementById(id);
function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) { if (k === 'class') e.className = v; else if (k in e) e[k] = v; else e.setAttribute(k, v); }
  for (const kid of kids) e.append(kid);
  return e;
}
function fill(select, items, keep) {
  const wanted = new Set([].concat(keep));
  select.textContent = '';
  if (select.dataset.optional) { const none = h('option', { value: '', textContent: S.none }); none.selected = wanted.has('') || !wanted.size; select.append(none); }
  for (const i of items) {
    const o = h('option', { value: i.value, textContent: i.description ? i.label + '   — ' + i.description : i.label });
    o.selected = wanted.has(i.value); select.append(o);
  }
}
// Hides the options that do not contain the typed text (selected ones stay selected).
function applyFilter(select, text) {
  const wanted = text.trim().toLowerCase();
  for (const o of select.options) o.hidden = Boolean(wanted) && !o.textContent.toLowerCase().includes(wanted);
}
function build(fields) {
  const legend = text => (text ? [h('legend', {}, text)] : []);
  schema = fields; widgets = {}; $('fields').textContent = '';
  for (const f of fields) {
    const err = h('div', { class: 'err' });
    let box, read, write;
    const list = ['var', 'dataset', 'model', 'models', 'hclust', 'installed', 'rlist'].includes(f.type) && !f.free;
    if (list) {
      const many = f.multi || f.type === 'models' || f.type === 'installed' || (f.type === 'rlist' && !f.single);
      const sel = h('select', { size: 8, multiple: many });
      const filter = f.filterable ? h('input', { type: 'text', placeholder: S.filter }) : null;
      box = h('fieldset', { class: 'field list' + (f.filterable ? ' wide' : '') }, ...legend(f.label), ...(filter ? [filter] : []), sel, err);
      if (f.filterable) sel.size = 14;
      if (f.compact && !many) { sel.size = 1; box.classList.add('compact'); }
      if (filter) filter.addEventListener('input', () => applyFilter(sel, filter.value));
      if (f.optional && !many) sel.dataset.optional = '1';
      read = () => many ? [...sel.selectedOptions].map(o => o.value) : (sel.selectedOptions[0]?.value ?? '');
      write = (v, items) => { if (items) fill(sel, items, v); else fill(sel, [...sel.options].map(o => ({ value: o.value, label: o.textContent })), v); };
      sel.addEventListener('change', () => touch(f.k));
      sel.addEventListener('dblclick', () => $('accept').click());
      widgets[f.k] = { box, err, read, write, sel, many, optional: f.optional };
    } else if (f.type === 'levelorder' || f.type === 'renames') {
      const order = f.type === 'levelorder', grid = h('div', { class: 'grid' }), inputs = {};
      box = h('fieldset', { class: 'field list' }, ...legend(f.label), grid, err);
      let last = '';
      const read = () => Object.fromEntries(Object.entries(inputs).map(([k, i]) => [k, i.value]));
      const setRows = rows => {
        if (JSON.stringify(rows) === last) return; last = JSON.stringify(rows);
        const old = read(); grid.textContent = ''; for (const k of Object.keys(inputs)) delete inputs[k];
        grid.append(h('div', { class: 'head' }, order ? S.newOrder : S.newName), h('div', { class: 'head' }, order ? S.oldLevels : S.oldName));
        rows.forEach((name, idx) => {
          const i = h('input', { type: order ? 'number' : 'text', value: old[name] ?? (order ? String(idx + 1) : name) });
          if (order) { i.min = 1; i.max = rows.length; }
          i.addEventListener('input', () => touch(f.k)); inputs[name] = i;
          grid.append(i, h('span', {}, name));
        });
      };
      widgets[f.k] = { box, err, read, write() {}, setRows };
    } else if (f.type === 'matrix') {
      const grid = h('div', { class: 'matrix' }); let cells = {}, last = '';
      box = h('fieldset', { class: 'field wide' }, ...legend(f.label), grid, err);
      const read = () => Object.entries(cells).map(([name, inputs]) => [name, inputs.map(i => i.value)]);
      const setRows = rows => {
        if (JSON.stringify(rows) === last) return; last = JSON.stringify(rows);
        const old = Object.fromEntries(read()); grid.textContent = ''; cells = {};
        const k = Math.max(rows.length - 1, 1); grid.style.gridTemplateColumns = 'auto repeat(' + k + ', 5.5em)';
        grid.append(h('div', { class: 'head' }, S.levels)); for (let j = 1; j <= k; j++) grid.append(h('div', { class: 'head' }, '.' + j));
        for (const name of rows) { grid.append(h('div', {}, name)); cells[name] = [];
          for (let j = 0; j < k; j++) { const i = h('input', { type: 'text', value: (old[name] || [])[j] ?? '0' }); i.addEventListener('input', () => touch(f.k)); cells[name].push(i); grid.append(i); } }
      };
      widgets[f.k] = { box, err, read, write() {}, setRows };
    } else if (f.type === 'choice') {
      const group = h('div');
      box = h('fieldset', { class: 'field' }, ...legend(f.label), group, err);
      read = () => (group.querySelector('input:checked') || {}).value ?? '';
      write = (v, items) => {
        if (items) { group.textContent = ''; for (const i of items) {
          const r = h('input', { type: 'radio', name: 'r-' + f.k, value: i.value, checked: i.value === v });
          r.addEventListener('change', () => touch(f.k)); group.append(h('label', { class: 'opt' }, r, i.label)); } }
        else for (const r of group.querySelectorAll('input')) r.checked = r.value === v;
      };
      widgets[f.k] = { box, err, read, write };
    } else if (f.type === 'formula') {
      // Rcmdr's modelFormula(): variables to double-click into the formula, operator and spline buttons, lhs ~ rhs.
      const T = f.strings, two = f.hasLhs !== false;
      const sel = h('select', { size: 8, multiple: true });
      const lhs = h('input', { type: 'text' }), rhs = h('input', { type: 'text' });
      const df = h('input', { type: 'text', value: '5' }), deg = h('input', { type: 'text', value: '2' });
      df.style.width = deg.style.width = '3em';
      const OPERATORS = ['+', '*', ':', '/', '-', '^', '(', '%'];
      const lastChar = s => { const c = [...s].reverse(); return c.length ? (c[0] !== ' ' || c.length === 1 ? c[0] : c[1]) : ''; };
      const canAddOperator = s => s.trim() !== '' && ![...OPERATORS, '|'].includes(lastChar(s));
      const picked = () => { const v = [...sel.selectedOptions].map(o => o.value); for (const o of sel.options) o.selected = false; return v; };
      const changed = () => { touch(f.k); rhs.focus(); };
      const append = text => { rhs.value += text; changed(); };
      sel.addEventListener('dblclick', () => {
        const v = picked()[0]; if (!v) return;
        if (two && lhs.value.trim() === '') { lhs.value = v; changed(); return; }
        const r = rhs.value, c = lastChar(r);
        rhs.value = r === '' || OPERATORS.includes(c) ? r + v : c === '|' ? r + ' ' + v : r + ' + ' + v; changed();
      });
      const joinOp = (op, sep) => () => {
        const r = rhs.value, v = picked(), check = !canAddOperator(r);
        if (check && !v.length) return;
        if (v.length > 1) append((check ? '' : ' + ') + v.join(sep)); else if (op === '+') append((check ? '' : ' + ') + v.join(''));
        else if (!check) append(op);
      };
      const simple = text => () => { if (canAddOperator(rhs.value)) append(text); };
      const actions = { '+': joinOp('+', ' + '), '*': joinOp('*', '*'), ':': joinOp(':', ':'), '/': simple('/'), '|': simple(' |'),
        '%in%': simple(' %in% '), '-': simple(' - '), '^': simple('^'),
        '(': () => { if (rhs.value.endsWith('+')) rhs.value += ' '; append('('); }, ')': simple(')') };
      const ops = h('div', { class: 'ops' });
      for (const op of ['+', '*', ':', '/', ...(f.showBar ? ['|'] : []), '%in%', '-', '^', '(', ')']) ops.append(h('button', { type: 'button', textContent: op, onclick: actions[op] }));
      const term = (fn, extra) => () => {
        const v = picked(); if (v.length > 1) return;
        const r = rhs.value; append((canAddOperator(r) ? ' + ' : ' ') + fn + '(' + (v[0] || ' ') + extra() + ')');
      };
      const splines = h('div', { class: 'ops' },
        h('button', { type: 'button', textContent: T.bs, onclick: term('bs', () => ', df=' + df.value) }),
        h('button', { type: 'button', textContent: T.ns, onclick: term('ns', () => ', df=' + df.value) }),
        h('button', { type: 'button', textContent: T.poly, onclick: term('poly', () => ', degree=' + deg.value) }),
        h('button', { type: 'button', textContent: T.raw, onclick: term('poly', () => ', degree=' + deg.value + ', raw=TRUE') }),
        h('label', { class: 'opt' }, T.df, df), h('label', { class: 'opt' }, T.deg, deg));
      for (const i of [lhs, rhs]) i.addEventListener('input', () => touch(f.k));
      lhs.style.width = '10em';
      const line = two ? h('div', { class: 'row formula' }, lhs, h('span', {}, ' ~ '), rhs) : h('div', { class: 'row formula' }, h('span', {}, ' ~ '), rhs);
      box = h('fieldset', { class: 'field wide' }, ...legend(f.label),
        h('div', { class: 'row' }, h('div', { class: 'formula-vars' }, h('div', { class: 'hint' }, T.vars), sel),
          h('div', {}, h('div', { class: 'hint' }, T.operators), ops, h('div', { class: 'hint' }, T.splines), splines)), line, err);
      read = () => ({ lhs: lhs.value, rhs: rhs.value });
      write = (v, items) => { if (items) fill(sel, items, []); if (v && typeof v === 'object') { lhs.value = v.lhs || ''; rhs.value = v.rhs || ''; } };
      widgets[f.k] = { box, err, read, write };
    } else if (f.type === 'table') {
      // Column names on top, row names on the left, the counts in between; resized by the rows/columns fields.
      const grid = h('div', { class: 'matrix' }); let cells = [], rowNames = [], colNames = [], last = '';
      box = h('fieldset', { class: 'field wide' }, ...legend(f.label), grid, err);
      // With fixed column names (colNames) the headers are labels and the rows have no names; f.rhs adds a last column.
      let rhs = [];
      read = () => ({ rows: rowNames.map(i => i.value), cols: colNames.map(i => i.value ?? i.textContent), cells: cells.map(r => r.map(i => i.value)), rhs: rhs.map(i => i.value) });
      const setDims = ([nr, nc], fixed) => {
        if (last === nr + 'x' + nc + (fixed || []).join()) return; last = nr + 'x' + nc + (fixed || []).join();
        const old = read(); grid.textContent = ''; cells = []; rowNames = []; colNames = []; rhs = [];
        const named = !fixed, extra = f.rhsLabel ? 1 : 0;
        grid.style.gridTemplateColumns = 'repeat(' + (nc + (named ? 1 : 0) + extra) + ', 5.5em)';
        if (named) grid.append(h('div'));
        for (let j = 0; j < nc; j++) {
          const c = fixed ? h('div', { class: 'head', textContent: fixed[j] }) : h('input', { type: 'text', value: old.cols[j] ?? String(j + 1) });
          if (!fixed) c.addEventListener('input', () => touch(f.k)); colNames.push(c); grid.append(c);
        }
        if (extra) grid.append(h('div', { class: 'head', textContent: f.rhsLabel }));
        for (let r = 0; r < nr; r++) {
          if (named) { const name = h('input', { type: 'text', value: old.rows[r] ?? String(r + 1) }); name.addEventListener('input', () => touch(f.k)); rowNames.push(name); grid.append(name); }
          cells.push([]);
          for (let j = 0; j < nc; j++) { const i = h('input', { type: 'text', value: (old.cells[r] || [])[j] ?? (f.cellDefault ?? '') }); i.addEventListener('input', () => touch(f.k)); cells[r].push(i); grid.append(i); }
          if (extra) { const i = h('input', { type: 'text', value: (old.rhs || [])[r] ?? '0' }); i.addEventListener('input', () => touch(f.k)); rhs.push(i); grid.append(i); }
        }
      };
      widgets[f.k] = { box, err, read, write() {}, setDims };
    } else if (f.type === 'hidden') {
      let value = ''; box = h('div', { class: 'hidden' });
      widgets[f.k] = { box, err: h('div'), read: () => value, write(v) { value = v ?? ''; } };
    } else if (f.type === 'note') {
      // A line of text between fields, like the red "OR" of Rcmdr's dialogs.
      box = h('div', { class: 'field note wide' + (f.heading ? ' heading' : '') }, f.label);
      widgets[f.k] = { box, err: h('div'), read: () => '', write() {} };
    } else if (f.type === 'flags') {
      const group = h('div'); const boxes = {};
      for (const [key, text] of f.flags) {
        const c = h('input', { type: 'checkbox' }); boxes[key] = c; c.addEventListener('change', () => touch(f.k));
        group.append(h('label', { class: 'opt' }, c, text));
      }
      box = h('fieldset', { class: 'field' }, ...legend(f.label), group, err);
      read = () => Object.fromEntries(Object.entries(boxes).map(([k, c]) => [k, c.checked]));
      write = v => { for (const [k, c] of Object.entries(boxes)) c.checked = Boolean(v && v[k]); };
      widgets[f.k] = { box, err, read, write };
    } else {
      const input = h('input', { type: 'text', placeholder: f.placeholder || (f.free ? S.freeHint : '') });
      const browse = f.type === 'file' || f.type === 'dir';
      const wide = !f.compact && (f.type === 'text' || f.type === 'name' || browse || f.free || f.type === 'numlist');
      box = h('div', { class: 'field' + (wide ? ' wide' : '') + (f.compact ? ' compact' : '') }, h('label', { class: 'title' }, f.label),
        browse ? h('div', { class: 'row' }, input, h('button', { type: 'button', textContent: S.browse, onclick: () => api.postMessage({ type: 'browse', k: f.k }) })) : input, err);
      read = () => input.value;
      write = v => { input.value = v ?? ''; };
      input.addEventListener('input', () => { dirty[f.k] = true; touch(f.k); });
      input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('accept').click(); } });
      widgets[f.k] = { box, err, read, write, input };
    }
    $('fields').append(box);
  }
}
function collect() { return Object.fromEntries(Object.entries(widgets).map(([k, w]) => [k, w.read()])); }
function touch(k) { clearTimeout(timer); timer = setTimeout(() => api.postMessage({ type: 'change', values: collect(), dirty }), 80); }
function applyLayout(layout, values) {
  for (const l of layout) {
    const w = widgets[l.k]; if (!w) continue;
    w.box.style.display = l.visible ? '' : 'none';
    if (w.setDims) { if (l.dims) w.setDims(l.dims, l.colNames); continue; }
    if (w.setRows) { w.setRows(l.rows || (l.items ? l.items.map(i => i.value) : [])); continue; }
    const current = values && l.k in values ? values[l.k] : w.read();
    if (l.items) w.write(l.set !== undefined ? l.set : current, l.items); else if (l.set !== undefined) w.write(l.set);
  }
}
window.addEventListener('message', ({ data }) => {
  if (data.type === 'init') { dirty = {}; build(data.fields); for (const [k, v] of Object.entries(data.values)) widgets[k] && !widgets[k].sel && !widgets[k].items && widgets[k].write(v);
    applyLayout(data.layout, data.values); const first = document.querySelector('select, input[type=text]'); if (first) first.focus(); }
  else if (data.type === 'layout') applyLayout(data.layout);
  else if (data.type === 'subtitle') $('sub').textContent = data.text;
  else if (data.type === 'path') { widgets[data.k].write(data.path); dirty[data.k] = true; touch(data.k); }
  else if (data.type === 'errors') {
    for (const [k, w] of Object.entries(widgets)) { w.err.textContent = data.errors[k] || ''; w.box.classList.toggle('bad', Boolean(data.errors[k])); }
    const first = Object.keys(data.errors)[0]; if (first && widgets[first]) widgets[first].box.scrollIntoView({ block: 'nearest' });
    $('status').textContent = data.errors.__form || ''; for (const b of document.querySelectorAll('footer button')) b.disabled = false;
  } else if (data.type === 'status') { $('status').textContent = data.text; for (const b of document.querySelectorAll('footer button')) b.disabled = Boolean(data.busy); }
});
const submit = type => { for (const w of Object.values(widgets)) { w.err.textContent = ''; w.box.classList.remove('bad'); } api.postMessage({ type, values: collect() }); };
if ($('dsPick')) $('dsPick').addEventListener('change', e => api.postMessage({ type: 'dataset', name: e.target.value }));
$('accept').onclick = () => submit('accept'); $('apply').onclick = () => submit('apply');
$('cancel').onclick = () => api.postMessage({ type: 'cancel' });
$('reset').onclick = () => api.postMessage({ type: 'reset' });
document.addEventListener('keydown', e => { if (e.key === 'Escape') api.postMessage({ type: 'cancel' }); });
api.postMessage({ type: 'ready' });
</script></body></html>`;
}

// One form per command, shown as an editor tab with every option at once.
class FormDialog {
  // env: { vscode, t, state, vars, activeModel, ctx, extra, subtitle }
  constructor(env) { this.env = env; }

  // onApply(values) runs the command without closing the form. Resolves with the
  // accepted values, or undefined when the form is cancelled or closed.
  run(spec, title, dialog, onApply) {
    const { vscode, t } = this.env;
    const fields = spec.fields || [];
    return new Promise(resolve => {
      const panel = vscode.window.createWebviewPanel('rCommanderForm', title,
        { viewColumn: vscode.ViewColumn.Active, preserveFocus: false }, { enableScripts: true, retainContextWhenHidden: true });
      let settled = false, busy = false;
      const finish = value => { if (!settled) { settled = true; resolve(value); } try { panel.dispose(); } catch { /* already closed */ } };
      const nonce = Array.from({ length: 24 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
      const strings = { accept: t('Accept'), apply: t('Apply'), cancel: t('Cancel'), reset: t('Reset'), browse: t('Browse...'), none: t('(none)'), filter: t('Type to filter...'), levels: t('Levels'), newOrder: t('New order'), oldLevels: t('Old levels'), newName: t('New name'), oldName: t('Old name'),
        freeHint: t('R did not answer; type variable names separated by commas'), dataset: t('Data set') };
      panel.webview.html = html(title, this.env.subtitle || '', nonce, strings, this.env.datasets || [], this.env.dataset);
      const post = message => panel.webview.postMessage(message);
      // Levels of the chosen factor come from the R session (cached by variable).
      const rowsCache = new Map();
      const listCache = new Map(), lastFor = {};
      const parseLines = (lines, labelColumn) => (lines || []).map(line => {
        const [value, description] = line.split('\t');
        return labelColumn === 2 && description ? { value, label: description, description: value } : { value, label: value, description };
      });
      const withRows = async layout => {
        for (const item of layout) {
          if (item.listFor !== undefined) {
            const field = fields.find(f => f.k === item.k);
            const key = `${item.k}:${item.listFor}`;
            if (item.listFor && !listCache.has(key)) {
              if (field.slow) post({ type: 'status', text: t(field.slow), busy: false });
              const lines = (await dialog.query(field.exprFor(item.listFor, this.env.ctx), field.timeout)) || [];
              listCache.set(key, parseLines(lines, field.labelColumn));
              post({ type: 'status', text: lines.length || !field.emptyMessage ? '' : t(field.emptyMessage), busy: false });
            }
            item.items = item.listFor ? listCache.get(key) : [];
            if (lastFor[item.k] !== item.listFor) { item.set = item.items.map(i => i.value); lastFor[item.k] = item.listFor; }
            continue;
          }
          if (!item.rowsFor) continue;
          if (!rowsCache.has(item.rowsFor)) {
            rowsCache.set(item.rowsFor, (await dialog.query(`levels(as.factor(${this.env.ctx.dv(item.rowsFor)}))`)) || []);
          }
          item.rows = rowsCache.get(item.rowsFor);
        }
        return layout;
      };
      const sendInit = async () => {
        const raw = model.initial(fields, this.env);
        post({ type: 'init', fields: describeFields(fields, this.env), values: raw, layout: await withRows(model.layout(fields, raw, this.env)) });
      };
      panel.onDidDispose(() => { if (!settled) { settled = true; resolve(undefined); } });
      panel.webview.onDidReceiveMessage(async message => {
        try {
          if (message.type === 'ready' || message.type === 'reset') await sendInit();
          else if (message.type === 'dataset') {
            const switched = this.env.switchDataset(message.name);
            Object.assign(this.env, { vars: switched.vars, ctx: switched.ctx, dataset: message.name });
            post({ type: 'subtitle', text: switched.subtitle });
            await sendInit();
          }
          else if (message.type === 'change') post({ type: 'layout', layout: await withRows(model.layout(fields, message.values, this.env, message.dirty)) });
          else if (message.type === 'cancel') finish(undefined);
          else if (message.type === 'browse') {
            const field = fields.find(f => f.k === message.k);
            const path = field.type === 'dir' ? await dialog.dir(field, t(field.label)) : await dialog.file(field, t(field.label));
            if (path) post({ type: 'path', k: message.k, path });
          } else if ((message.type === 'accept' || message.type === 'apply') && !busy) {
            const errors = model.validate(fields, message.values, this.env);
            if (Object.keys(errors).length) return post({ type: 'errors', errors });
            const values = model.normalize(fields, message.values);
            // Rules that involve several fields at once (e.g. "pick a package or type its name").
            const problem = spec.check?.(values);
            if (problem) return post({ type: 'errors', errors: { __form: t(problem) } });
            busy = true;
            post({ type: 'status', text: t('Working...'), busy: true });
            const ok = spec.after ? await spec.after(values, dialog, this.env.ctx) : true;
            if (ok === false) { busy = false; return post({ type: 'errors', errors: {} }); }
            if (message.type === 'accept') return finish(values);
            await onApply(values);
            busy = false;
            post({ type: 'status', text: t('Applied. The form stays open.'), busy: false });
          }
        } catch (error) {
          busy = false;
          post({ type: 'status', text: String(error.message || error), busy: false });
        }
      });
    });
  }
}

module.exports = { FormDialog, html, describeFields };

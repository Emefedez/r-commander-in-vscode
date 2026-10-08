// Finds which R functions each menu command uses, so the editor hover can say where
// in the R Commander menus a function lives. The code of every command is generated
// with sample answers (first option, then last option) and its calls are collected.
const model = require('../lib/formmodel');
const { context } = require('../lib/rhelpers');
const catalog = require('../catalog');

const vars = [
  ...['n1', 'n2', 'n3', 'n4', 'n5'].map(name => ({ name, kind: 'numeric', levels: 0, discrete: false })),
  { name: 'd', kind: 'numeric', levels: 0, discrete: true },
  ...['f2', 'f3', 'f2b'].map((name, i) => ({ name, kind: 'factor', levels: i === 1 ? 3 : 2, discrete: false }))
];
const state = {
  datasets: { Dataset: { rows: 60, columns: 9, vars }, Other: { rows: 5, columns: 2, vars: [] } },
  models: [{ name: 'RegModel.1', cls: 'lm' }, { name: 'RegModel.2', cls: 'lm' }], hclusts: ['HClust.1'], objects: []
};
const t = text => text;
const SKIP = new Set(['c', 'list', 'print', 'cat', 'local', 'paste', 'paste0', 'rep', 'seq_along', 'names', 'rownames', 'colnames', 'length',
  'as.numeric', 'as.character', 'is.character', 'is.numeric', 'sapply', 'lapply', 'vapply', 'invisible', 'function', 'rbind', 'cbind', 'round',
  'order', 'table', 'plot', 'par', 'legend', 'axis', 'lines', 'points', 'text', 'if', 'for', 'return', 'matrix', 'data.frame', 'factor', 'rm',
  'levels', 'unique', 'sort', 'which', 'is.na', 'max', 'min', 'abs', 'sqrt', 'exp', 'log']);
// Plain R equivalents of what Rcmdr calls under another name.
const ALIASES = {
  hist: ['Histogram'], barplot: ['barGraph'], qqnorm: ['QQPlot'], qqline: ['QQPlot'], density: ['DensityPlot'], mean: ['numericalSummaries', 'statisticsTable'],
  sd: ['numericalSummaries', 'statisticsTable'], median: ['numericalSummaries', 'statisticsTable'], quantile: ['numericalSummaries'], var: ['statisticsTable'],
  cor: ['correlationMatrix', 'correlationTest'], IQR: ['numericalSummaries'], sample: ['normalDistributionSamples', 'uniformDistributionSamples'], View: ['viewDataSet', 'viewData']
};

function autofill(spec, ctx, pass) {
  const env = { t, state, vars, ctx, activeModel: 'RegModel.1', extra: { pkgs: ['stats'] } };
  const fields = spec.fields || [];
  const raw = {};
  for (const f of fields) {
    const values = model.normalize(fields, raw);
    if (f.when && !f.when(values)) continue;
    const list = model.items(f, values, env) || [];
    switch (f.type) {
      case 'var': raw[f.k] = f.multi ? list.slice(0, f.min === 0 ? 1 : 3).map(i => i.value) : f.optional && pass === 'A' ? '' : list[0]?.value; break;
      case 'dataset': case 'hclust': case 'model': raw[f.k] = list[0]?.value; break;
      case 'models': raw[f.k] = list.slice(0, 2).map(i => i.value); break;
      case 'installed': case 'rlist': raw[f.k] = ['x']; break;
      case 'levelorder': raw[f.k] = { a: '1', b: '2', c: '3' }; break;
      case 'matrix': raw[f.k] = [['a', ['1', '0']], ['b', ['-1', '1']], ['c', ['0', '-1']]]; break;
      case 'renames': raw[f.k] = { n1: 'x1' }; break;
      case 'name': case 'text': raw[f.k] = pass === 'B' && f.sample ? f.sample : String(model.evalDefault(f.def, ctx, values) ?? 'x'); break;
      case 'num': case 'numlist': raw[f.k] = String(f.def ?? '1'); break;
      case 'choice': raw[f.k] = pass === 'B' ? list[list.length - 1].value : list[f.def || 0].value; break;
      case 'flags': raw[f.k] = Object.fromEntries(f.items.map(([key, , on]) => [key, pass === 'B' ? true : Boolean(on)])); break;
      default: raw[f.k] = '/tmp/x';
    }
  }
  return model.normalize(fields, raw);
}

function collect(ids) {
  const found = {};
  const add = (name, id) => {
    if (!name || SKIP.has(name) || /^(rcp|UseMethod)$/.test(name)) return;
    (found[name] ||= new Set()).add(id);
  };
  for (const id of ids) {
    const spec = catalog[id];
    if (!spec.code) continue;
    for (const pass of ['A', 'B']) {
      let code = '';
      try {
        const ctx = context('Dataset', { objects: [] });
        ctx.model = 'RegModel.1';
        ctx.kindOf = name => vars.find(v => v.name === name)?.kind;
        code = spec.code(autofill(spec, ctx, pass), ctx) || '';
      } catch { continue; }
      for (const m of code.matchAll(/(?<![A-Za-z0-9._$"'@])(?:[A-Za-z][A-Za-z0-9.]*::)?([A-Za-z.][A-Za-z0-9._]*)\(/g)) add(m[1], id);
      for (const m of code.matchAll(/\bcar::contr\.Sum\b/g)) add('contr.Sum', id);
    }
  }
  for (const [fn, targets] of Object.entries(ALIASES)) for (const id of targets) if (ids.includes(id)) add(fn, id);
  return Object.fromEntries(Object.entries(found).map(([fn, set]) => [fn, [...set]]).sort(([a], [b]) => a.localeCompare(b)));
}

module.exports = { collect };

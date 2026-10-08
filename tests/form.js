// The form's own behaviour with a fake webview: starting values, switching the data set inside the form.
const assert = require('node:assert/strict');
const { FormDialog } = require('../lib/form');
const { context } = require('../lib/rhelpers');
const catalog = require('../catalog');
const { t } = require('../lib/i18n');

const numeric = names => names.map(name => ({ name, kind: 'numeric', levels: 0, discrete: false }));
const state = { datasets: {
  cars93: { name: 'cars93', rows: 93, columns: 3, vars: numeric(['Price', 'MPG.city', 'Weight']) },
  iris: { name: 'iris', rows: 150, columns: 5, vars: [...numeric(['Sepal.Length', 'Sepal.Width', 'Petal.Length', 'Petal.Width']), { name: 'Species', kind: 'factor', levels: 3, discrete: false }] }
}, models: [], hclusts: [], objects: [] };

(async () => {
  const sent = [];
  let receive;
  let html = '';
  let disposed = false;
  const panel = {
    webview: { set html(value) { html = value; }, postMessage: message => sent.push(message), onDidReceiveMessage: callback => { receive = callback; } },
    onDidDispose: () => {}, dispose: () => { disposed = true; }
  };
  const vscode = { ViewColumn: { Active: 1 }, window: { createWebviewPanel: () => panel } };
  const makeCtx = name => context(name, { objects: [] });
  const env = { vscode, t, state, vars: state.datasets.cars93.vars, activeModel: undefined, ctx: makeCtx('cars93'), extra: {}, subtitle: 'Conjunto de datos: cars93',
    dataset: 'cars93', datasets: Object.values(state.datasets).map(d => ({ name: d.name, description: `${d.rows} × ${d.columns}` })),
    switchDataset: name => { env.ctx = makeCtx(name); return { vars: state.datasets[name].vars, ctx: env.ctx, subtitle: `Conjunto de datos: ${name}` }; } };

  const spec = catalog.boxPlot;
  const dialog = { ctx: env.ctx, query: async () => [] };
  let accepted;
  const done = new FormDialog(env).run(spec, 'Diagrama de cajas', dialog, async () => {}).then(values => { accepted = values; });

  // The page offers a data set chooser with both data sets, the active one selected.
  assert.match(html, /id="dsPick"/);
  assert.match(html, /<option value="cars93" selected>cars93 — 93 × 3<\/option>/);
  assert.match(html, /<option value="iris">iris — 150 × 5<\/option>/);

  await receive({ type: 'ready' });
  const first = sent.find(m => m.type === 'init');
  const listed = layout => layout.find(l => l.k === 'ys').items.map(i => i.value);
  assert.deepEqual(listed(first.layout), ['Price', 'MPG.city', 'Weight'], 'starts with the active data set');

  // Choosing iris inside the form brings its petal variables and a fresh form.
  sent.length = 0;
  await receive({ type: 'dataset', name: 'iris' });
  assert.equal(sent.find(m => m.type === 'subtitle').text, 'Conjunto de datos: iris');
  const second = sent.find(m => m.type === 'init');
  assert.deepEqual(listed(second.layout), ['Sepal.Length', 'Sepal.Width', 'Petal.Length', 'Petal.Width']);

  // Accepting generates code for the data set that was chosen.
  sent.length = 0;
  await receive({ type: 'accept', values: { ys: ['Petal.Length'], g: 'Species', flags: { id: false }, xlab: '<auto>', ylab: '<auto>', main: '<auto>' } });
  await done;
  assert.deepEqual(accepted.ys, ['Petal.Length']);
  assert.equal(spec.code(accepted, env.ctx), 'boxplot(Petal.Length ~ Species, data = iris, ylab = "Petal.Length")');
  assert.ok(disposed, 'the form closes on accept');
  console.log('the form can switch data sets and generates code for the one chosen.');
})();

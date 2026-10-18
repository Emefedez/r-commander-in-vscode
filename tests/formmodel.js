// Rules of the table fields: level order (a position box per level) and renaming.
const assert = require('node:assert/strict');
const model = require('../lib/formmodel');
const { t } = require('../lib/i18n');
const { context } = require('../lib/rhelpers');
const catalog = require('../catalog');

const vars = [{ name: 'a', kind: 'numeric' }, { name: 'b', kind: 'numeric' }, { name: 'g', kind: 'factor', levels: 3 }];
const env = { t, vars, state: { datasets: {}, models: [] }, ctx: context('D'), extra: {} };

{ // reorder factor levels: each level gets a position box
  const fields = catalog.reorderFactor.fields;
  const raw = { f: 'g', order: { low: '2', mid: '3', high: '1' }, name: '<same as original>', ordered: { ordered: false } };
  assert.deepEqual(model.validate(fields, raw, env), {});
  const values = model.normalize(fields, raw);
  assert.deepEqual(values.order, ['high', 'low', 'mid']);
  assert.equal(catalog.reorderFactor.code(values, env.ctx), "D$g <- with(D, factor(g, levels=c('high','low','mid')))");
  assert.ok(model.validate(fields, { ...raw, order: { low: '1', mid: '1', high: '3' } }, env).order, 'duplicate positions rejected');
  assert.ok(model.validate(fields, { ...raw, order: { low: '1', mid: '2', high: '4' } }, env).order, 'out of range rejected');
  assert.ok(model.validate(fields, { ...raw, order: {} }, env).order, 'needs a factor first');
  const layout = model.layout(fields, raw, env);
  assert.equal(layout.find(l => l.k === 'order').rowsFor, 'g');
  assert.equal(model.layout(fields, { ...raw, f: '' }, env).find(l => l.k === 'order').rowsFor, undefined);
}
{ // the renames table (old names with a box for the new name)
  const fields = [{ k: 'map', type: 'renames', label: 'Variables to rename' }];
  const raw = { map: { a: 'alpha', b: 'b', g: 'group' } };
  assert.deepEqual(model.validate(fields, raw, env), {});
  const values = model.normalize(fields, raw);
  assert.deepEqual(values.map, [['a', 'alpha'], ['g', 'group']]);
  assert.ok(model.validate(fields, { map: { a: 'a', b: 'b', g: 'g' } }, env).map, 'nothing changed');
  assert.ok(model.validate(fields, { map: { a: 'b', b: 'b', g: 'g' } }, env).map, 'duplicate name');
  assert.ok(model.validate(fields, { map: { a: '1x', b: 'b', g: 'g' } }, env).map, 'invalid name');
  assert.deepEqual(model.validate(fields, { map: { a: 'b', b: 'c', g: 'g' } }, env), {}, 'swapping through a freed name is fine');
  assert.equal(model.layout(fields, raw, env)[0].items.length, 3);
}
{ // model formula: variables marked as factors, both sides required unless one-sided
  const fields = [{ k: 'formula', type: 'formula', label: 'Model Formula' }];
  assert.deepEqual(model.layout(fields, { formula: { lhs: '', rhs: '' } }, env)[0].items.map(i => i.label), ['a', 'b', `g [${t('factor')}]`]);
  assert.ok(model.validate(fields, { formula: { lhs: '', rhs: 'b' } }, env).formula, 'left-hand side required');
  assert.ok(model.validate(fields, { formula: { lhs: 'a', rhs: ' ' } }, env).formula, 'right-hand side required');
  assert.deepEqual(model.normalize(fields, { formula: { lhs: ' a ', rhs: 'b + g ' } }).formula, { lhs: 'a', rhs: 'b + g' });
  const oneSided = [{ k: 'formula', type: 'formula', label: '', hasLhs: false, optional: true }];
  assert.deepEqual(model.validate(oneSided, { formula: { lhs: '', rhs: '' } }, env), {}, 'optional one-sided formula');
}
{ // table of counts sized by two other fields; notes and hidden fields hold no input
  const fields = [{ k: 'nr', type: 'num', def: '3' }, { k: 'nc', type: 'num', def: '2' }, { k: 'n', type: 'note', label: 'OR' },
    { k: 'cls', type: 'hidden', def: c => c.modelClass }, { k: 'tab', type: 'table', rowsOf: 'nr', colsOf: 'nc' }];
  const raw = model.initial(fields, { ...env, ctx: { ...env.ctx, modelClass: 'glm' } });
  assert.equal(raw.cls, 'glm');
  assert.deepEqual(model.layout(fields, raw, env).find(l => l.k === 'tab').dims, [3, 2]);
  const table = { rows: ['r1', 'r2'], cols: ['c1', 'c2'], cells: [['1', '2'], ['3', 'x']], rhs: [] };
  assert.ok(model.validate(fields, { ...raw, tab: table }, env).tab, 'non-numeric cell');
  assert.ok(model.validate(fields, { ...raw, tab: { ...table, cells: [['1', '2'], ['3', '4']], rows: ['r', 'r'] } }, env).tab, 'repeated row names');
  assert.ok(!('n' in model.normalize(fields, raw)), 'notes have no value');
}
console.log('form table fields behave.');

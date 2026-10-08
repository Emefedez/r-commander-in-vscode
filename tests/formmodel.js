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
  const raw = { f: 'g', order: { low: '2', mid: '3', high: '1' }, name: '' };
  assert.deepEqual(model.validate(fields, raw, env), {});
  const values = model.normalize(fields, raw);
  assert.deepEqual(values.order, ['high', 'low', 'mid']);
  assert.equal(catalog.reorderFactor.code(values, env.ctx), 'D$g <- factor(D$g, levels = c("high", "low", "mid"))');
  assert.ok(model.validate(fields, { ...raw, order: { low: '1', mid: '1', high: '3' } }, env).order, 'duplicate positions rejected');
  assert.ok(model.validate(fields, { ...raw, order: { low: '1', mid: '2', high: '4' } }, env).order, 'out of range rejected');
  assert.ok(model.validate(fields, { ...raw, order: {} }, env).order, 'needs a factor first');
  const layout = model.layout(fields, raw, env);
  assert.equal(layout.find(l => l.k === 'order').rowsFor, 'g');
  assert.equal(model.layout(fields, { ...raw, f: '' }, env).find(l => l.k === 'order').rowsFor, undefined);
}
{ // rename variables: a table of old names with a box for the new name
  const fields = catalog.renameVariables.fields;
  const raw = { map: { a: 'alpha', b: 'b', g: 'group' } };
  assert.deepEqual(model.validate(fields, raw, env), {});
  const values = model.normalize(fields, raw);
  assert.deepEqual(values.map, [['a', 'alpha'], ['g', 'group']]);
  assert.equal(catalog.renameVariables.code(values, env.ctx), 'names(D)[match(c("a", "g"), names(D))] <- c("alpha", "group")');
  assert.ok(model.validate(fields, { map: { a: 'a', b: 'b', g: 'g' } }, env).map, 'nothing changed');
  assert.ok(model.validate(fields, { map: { a: 'b', b: 'b', g: 'g' } }, env).map, 'duplicate name');
  assert.ok(model.validate(fields, { map: { a: '1x', b: 'b', g: 'g' } }, env).map, 'invalid name');
  assert.deepEqual(model.validate(fields, { map: { a: 'b', b: 'c', g: 'g' } }, env), {}, 'swapping through a freed name is fine');
  assert.equal(model.layout(fields, raw, env)[0].items.length, 3);
}
console.log('form table fields behave.');

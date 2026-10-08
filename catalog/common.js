// Field definitions shared by many commands.
const alt = (neg = 'Difference < 0', pos = 'Difference > 0') => ({
  k: 'alt', type: 'choice', label: 'Alternative hypothesis',
  choices: [['two.sided', 'Two-sided'], ['less', neg], ['greater', pos]]
});
const conf = { k: 'conf', type: 'num', label: 'Confidence level', def: '0.95', min: 0.0001, max: 0.9999 };
const numVar = (k = 'x', label = 'Variable (pick one)', extra = {}) => ({ k, type: 'var', kind: 'numeric', label, ...extra });
const numVars = (k = 'xs', label = 'Variables (pick one or more)', min = 1, extra = {}) =>
  ({ k, type: 'var', kind: 'numeric', multi: true, min, label, ...extra });
const factor = (k = 'g', label = 'Factor (pick one)', extra = {}) => ({ k, type: 'var', kind: 'factor', label, ...extra });
const factors = (k = 'gs', label = 'Factors (pick one or more)', min = 1, extra = {}) =>
  ({ k, type: 'var', kind: 'factor', multi: true, min, label, ...extra });
const groups = (k = 'g', label = 'Plot by groups (optional)') => ({ k, type: 'var', kind: 'factor', optional: true, label });
const twoLevel = (k = 'g', label = 'Groups (pick one two-level factor)', extra = {}) => ({ k, type: 'var', kind: 'twolevel', label, ...extra });
const anyVar = (k, label, extra = {}) => ({ k, type: 'var', kind: 'any', label, ...extra });
const newName = (k, prefix, label = 'Name for the new object') =>
  ({ k, type: 'name', label, def: c => c.fresh(prefix) });

// Rcmdr's "Plot Labels": blank or <auto> keeps R's automatic label.
const labelDefs = {
  xlab: ['x-axis label', 'Etiqueta x'], ylab: ['y-axis label', 'Etiqueta y'], main: ['Graph title', 'Título']
};
const labelFields = (keys = ['xlab', 'ylab', 'main']) => keys.map(k => ({
  k, type: 'text', optional: true, def: '<auto>', label: labelDefs[k][0], sample: labelDefs[k][1]
}));
const given = value => value !== undefined && value.trim() !== '' && value.trim() !== '<auto>';
const labelArgs = (v, keys = ['xlab', 'ylab', 'main'], names = {}) =>
  keys.filter(k => given(v[k])).map(k => `, ${names[k] || k} = ${JSON.stringify(v[k].trim())}`).join('');
const identifyField = { k: 'idn', type: 'num', int: true, min: 0, def: '0', label: 'Number of points to identify' };

module.exports = { labelFields, labelArgs, given, identifyField, alt, conf, numVar, numVars, factor, factors, groups, twoLevel, anyVar, newName };

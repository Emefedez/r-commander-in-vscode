// Data-management commands that the RcmdrPlugin.TeachStat plug-in redefines in its own "Data" menu.
const { rs, rc, S, splitList } = require('../lib/rhelpers');
const { numVars, anyVar } = require('./common');
const base = require('./data');

const lines = (...parts) => parts.flat().filter(Boolean).join('\n');
// Names of the new variables: the same as the old ones, or a prefix (a single variable takes the name as it is).
const prefixField = { k: 'prefix', type: 'text', optional: true, def: '<same as variables>', label: 'New variable name or prefix for multiple variables:   ', sample: 'new_' };
const newName = (v, old) => (!v.prefix.trim() || v.prefix.trim() === '<same as variables>' || v.prefix.trim() === '<same as original>' ? old : `${v.prefix.trim()}${v.vars.length === 1 ? '' : old}`);
const within = (c, body) => `${c.ds} <- within(${c.ds}, {\n${body}\n})`;
const quoted = names => names.map(n => `'${n}'`).join(',');

module.exports = {
  // Rcmdr's own editor window has no counterpart here: the data are typed in the dialog.
  newDataSet2: base.newDataSet,
  variablesandtypesDataSet: { code: (v, c) => `listTypesVariables("${c.ds}")` },

  ConvertVariables: {
    fields: [anyVar('vars', 'Select one or more variables to modify their type:', { multi: true }),
      { k: 'to', type: 'choice', label: 'Convert selected variables to: ', choices: [['nominal', 'Nominal'], ['ordinal', 'Ordinal'], ['numeric', 'Numeric']] }],
    code(v, c) {
      const convert = name => v.to === 'nominal' ? `as.factor(${S(name)})` : v.to === 'ordinal' ? `as.ordered(${S(name)})`
        : c.kindOf(name) === 'factor' ? `as.numeric(levels(${S(name)}))[${S(name)}]` : `as.numeric(${S(name)})`;
      return within(c, v.vars.map(n => `  ${S(n)} <- ${convert(n)}`).join('\n'));
    }
  },

  numericToFactor2: {
    fields: [numVars('vars', 'Variables (pick one or more)'),
      { k: 'levels', type: 'choice', label: 'Factor Levels', choices: [['numbers', '<same as variables>'], ['names', 'Level Names for']] },
      prefixField, { k: 'flags', type: 'flags', label: 'Options', items: [['ordered', 'Make ordered factor', false]] }],
    async after(v, ui) {
      v.names = {};
      if (v.levels !== 'names') return true;
      for (const n of v.vars) {
        const values = (await ui.query(`as.character(sort(unique(${ui.ctx.dv(n)})))`)) || [];
        const text = await ui.text({ label: ui.t('Level names for {0}, in increasing order of value (current: {1})', n, values.join(', ')), def: values.join(', ') });
        if (text === undefined) return false;
        v.names[n] = splitList(text.replace(/\s*,\s*/g, ','));
      }
      return true;
    },
    code(v, c) {
      const ordered = v.flags.ordered;
      return within(c, v.vars.map(n => `  ${S(newName(v, n))} <- ` + (v.levels === 'names'
        ? `factor(${S(n)}, labels=c(${quoted(v.names[n])})${ordered ? ', ordered=TRUE' : ''})` : `as.${ordered ? 'ordered' : 'factor'}(${S(n)})`)).join('\n'));
    }
  },

  binVariable2: {
    pkgs: ['RcmdrMisc'],
    fields: [{ k: 'x', type: 'var', kind: 'numeric', label: 'Variable to bin (pick one)' },
      { k: 'name', type: 'name', label: 'New variable name', def: 'binned' },
      { k: 'bins', type: 'num', int: true, min: 2, def: '3', label: 'Number of bins:' },
      { k: 'method', type: 'choice', label: 'Binning Method', choices: [['intervals', 'Equal-width bins'], ['proportions', 'Equal-count bins'], ['natural', 'Natural breaks (k-means)']] },
      { k: 'labels', type: 'choice', label: 'Level Names', choices: [['numbers', 'Numbers'], ['ranges', 'Ranges'], ['midpoints', 'Ranges midpoints'], ['names', 'Bin Names']] },
      { k: 'binNames', type: 'text', def: '', label: 'Bin Names', sample: 'low,mid,high', when: v => v.labels === 'names' }],
    check: v => (v.labels === 'names' && splitList(v.binNames.replace(/\s*,\s*/g, ',')).length !== Number(v.bins) ? 'Level names must be unique.' : undefined),
    code(v, c) {
      const target = `${c.ds}$${S(v.name)}`;
      const labels = v.labels === 'numbers' ? 'FALSE' : v.labels === 'names' ? `c(${quoted(splitList(v.binNames.replace(/\s*,\s*/g, ',')))})` : 'NULL';
      return lines(`${target} <- as.ordered(with(${c.ds}, binVariable(${S(v.x)}, bins=${v.bins}, method='${v.method}', labels=${labels})))`,
        v.labels === 'midpoints' && [`levels(${target})<-local({`, ` \t.le <- read.table(text=gsub("[^-.0-9]", " ", levels(${target})))`, ' \tif(is.factor(.le$V1)){',
          `\t\tlevels(.le$V1)[1] <- min(${target})`, '\t\t.le$V1 <- as.numeric(levels(.le$V1)[.le$V1])', ' \t}', ' \twith(.le,(V1+V2)/2)', '})', `${target} <- as.numeric(levels(${target}))[${target}]`].join('\n'));
    }
  },

  reorderFactors: {
    fields: [{ k: 'vars', type: 'var', kind: 'factor', multi: true, label: 'Factor (pick one or more)' }, prefixField,
      { k: 'flags', type: 'flags', label: 'Options', items: [['ordered', 'Make ordered factor', false]] }],
    async after(v, ui) {
      v.orders = {};
      for (const n of v.vars) {
        const levels = (await ui.query(`levels(as.factor(${ui.ctx.dv(n)}))`)) || [];
        const text = await ui.text({ label: ui.t('Levels in the new order, separated by commas'), def: levels.join(', '),
          validate: s => splitList(s.replace(/\s*,\s*/g, ',')).length ? undefined : ui.t('A value is required.') });
        if (text === undefined) return false;
        v.orders[n] = text.split(',').map(s => s.trim()).filter(Boolean);
      }
      return true;
    },
    code: (v, c) => within(c, v.vars.map(n => `  ${S(newName(v, n))} <- factor(${S(n)}, levels=c(${quoted(v.orders[n])})${v.flags.ordered ? ', ordered=TRUE' : ''})`).join('\n'))
  }
};

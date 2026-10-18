// Data-management commands that the RcmdrPlugin.TeachStat plug-in redefines in its own "Data" menu.
const { rs, rc, S, splitList } = require('../lib/rhelpers');
const { numVars, anyVar } = require('./common');
const base = require('./data');

const lines = (...parts) => parts.flat().filter(Boolean).join('\n');
// Names of the new variables: the same as the old ones, or a prefix (a single variable takes the name as it is).
const newName = (v, old) => (!v.prefix.trim() || v.prefix.trim() === '<same as variables>' || v.prefix.trim() === '<same as original>' ? old : `${v.prefix.trim()}${v.vars.length === 1 ? '' : old}`);
const within = (c, body) => `${c.ds} <- within(${c.ds}, {\n${body}\n})`;
const quoted = names => names.map(n => `'${n}'`).join(',');

module.exports = {
  // Rcmdr's own editor window has no counterpart here: the data are typed in the dialog.
  newDataSet2: base.newDataSet,
  variablesandtypesDataSet: { code: (v, c) => `listTypesVariables("${c.ds}")` },

  // TeachStat lists the variables by type and converts the selected ones with its Nominal/Ordinal/Numeric buttons.
  ConvertVariables: {
    fields: [{ k: 'n', type: 'note', heading: true, label: 'Select one or more variables to modify their type:' },
      { k: 'nominal', type: 'var', kind: 'nominal', multi: true, min: 0, label: 'Nominal variables' },
      { k: 'ordinal', type: 'var', kind: 'ordinal', multi: true, min: 0, label: 'Ordinal variables' },
      { k: 'numeric', type: 'var', kind: 'numeric', multi: true, min: 0, label: 'Numeric variables' },
      { k: 'other', type: 'var', kind: 'other', multi: true, min: 0, label: 'Other variables' },
      { k: 'to', type: 'choice', label: 'Convert selected variables to: ', choices: [['nominal', 'Nominal'], ['ordinal', 'Ordinal'], ['numeric', 'Numeric']] }],
    check: v => (![...v.nominal, ...v.ordinal, ...v.numeric, ...v.other].length ? 'You must select one or more variables.' : undefined),
    code(v, c) {
      const all = [...v.nominal, ...v.ordinal, ...v.numeric, ...v.other];
      const line = name => (v.to === 'nominal' ? (v.ordinal.includes(name) ? `\n  class(${name}) <- "factor"` : `\n  ${name} <- as.factor(${name})`)
        : v.to === 'ordinal' ? `\n  ${name} <- as.ordered(${name})`
          : ['factor', 'ordered'].includes(c.kindOf(name)) ? `\n  ${name} <- as.numeric(levels(${name}))[${name}]` : `\n  ${name} <- as.numeric(${name})`);
      return `${c.ds} <- within(${c.ds}, {${all.map(line).join('')}\n})`;
    }
  },

  numericToFactor2: {
    fields: [numVars('vars', 'Variables (pick one or more)'),
      { k: 'levels', type: 'choice', label: 'Factor Levels', choices: [['names', 'Supply level names'], ['numbers', 'Use numbers']] },
      { k: 'prefix', type: 'text', label: 'New variable name or prefix for multiple variables:  ', def: '<same as variables>' },
      { k: 'flags', type: 'flags', label: '', items: [['ordered', 'Make ordered factor', false]] }],
    // "Level Names for ...": one name per value (once for all when they share their values).
    async after(v, ui) {
      v.names = {};
      if (v.levels !== 'names') return true;
      const valuesOf = {};
      for (const n of v.vars) valuesOf[n] = (await ui.query(`as.character(sort(unique(${ui.ctx.dv(n)})))`)) || [];
      const same = v.vars.length === 1 || v.vars.every(n => JSON.stringify(valuesOf[n]) === JSON.stringify(valuesOf[v.vars[0]]));
      for (const n of same ? [v.vars[0]] : v.vars) {
        const names = [];
        for (const value of valuesOf[n]) {
          const text = await ui.text({ label: `${ui.t('Level Names for')} ${same && v.vars.length > 1 ? 'Factors' : n} — ${ui.t('Numeric value')} ${value}: ${ui.t('Level name')}`, def: '',
            validate: x => x.trim() ? undefined : ui.t('A value is required.') });
          if (text === undefined) return false;
          names.push(text.trim());
        }
        for (const m of same ? v.vars : [n]) v.names[m] = names;
      }
      return true;
    },
    code(v, c) {
      const ordered = v.flags.ordered;
      return within(c, v.vars.map(n => `  ${newName(v, n)} <- ` + (v.levels === 'names'
        ? `factor(${n}, labels=c(${quoted(v.names[n])})${ordered ? ', ordered=TRUE' : ''})` : `as.${ordered ? 'ordered' : 'factor'}(${n})`)).join('\n'));
    }
  },

  binVariable2: {
    fields: [{ k: 'x', type: 'var', kind: 'numeric', label: 'Variable to bin (pick one)' },
      { k: 'name', type: 'name', label: 'New variable name', def: 'variable' },
      { k: 'bins', type: 'num', int: true, min: 2, max: 20, def: '3', label: 'Number of bins:' },
      { k: 'labels', type: 'choice', label: 'Level Names', choices: [['specify', 'Specify names'], ['numbers', 'Numbers'], ['ranges', 'Ranges'], ['midpoints', 'Ranges midpoints']] },
      { k: 'method', type: 'choice', label: 'Binning Method', choices: [['intervals', 'Equal-width bins'], ['proportions', 'Equal-count bins'], ['natural', 'Natural breaks\n(from K-means clustering)']] }],
    // "Bin Names": a name for each bin, 1 to n by default.
    async after(v, ui) {
      if (v.labels !== 'specify') return true;
      v.names = [];
      for (let i = 1; i <= Number(v.bins); i++) {
        const text = await ui.text({ label: `${ui.t('Bin Names')} — ${ui.t('Bin')} ${i}: ${ui.t('Name')}`, def: String(i) });
        if (text === undefined) return false;
        v.names.push(text.trim());
      }
      if (new Set(v.names).size !== v.names.length) { await ui.vscode.window.showWarningMessage(ui.t('Level names must be unique.')); return false; }
      return true;
    },
    code(v, c) {
      const target = `${c.ds}$${v.name}`;
      const labels = v.labels === 'numbers' ? 'FALSE' : v.labels === 'specify' ? `c(${quoted(v.names)})` : 'NULL';
      return lines(`${target} <- as.ordered(with(${c.ds}, binVariable(${v.x}, bins=${v.bins}, method='${v.method}', labels=${labels})))`,
        v.labels === 'midpoints' && [`levels(${target})<-local({`, ` \t.le <- read.table(text=gsub("[^-.0-9]", " ", levels(${target})), stringsAsFactors=TRUE)`, ' \tif(is.factor(.le$V1)){',
          // Two fixes to TeachStat's code, written for R < 4.0: read.table() must give factors, and the minimum is
          // the one of the original variable (TeachStat takes it from the new ordered factor, which fails).
          `\t\tlevels(.le$V1)[1] <- min(${c.ds}$${v.x})`, '\t\t.le$V1 <- as.numeric(levels(.le$V1)[.le$V1])', ' \t}', ' \twith(.le,(V1+V2)/2)', '})', `${target} <- as.numeric(levels(${target}))[${target}]`].join('\n'));
    }
  },

  reorderFactors: {
    fields: [{ k: 'vars', type: 'var', kind: 'factor', multi: true, label: 'Factor (pick one or more)' },
      { k: 'prefix', type: 'text', label: 'New variable name or prefix for multiple variables:  ', def: '<same as original>' },
      { k: 'flags', type: 'flags', label: '', items: [['ordered', 'Make ordered factor', false]] }],
    async after(v, ui) {
      v.orders = {};
      for (const n of v.vars) {
        const levels = (await ui.query(`levels(as.factor(${ui.ctx.dv(n)}))`)) || [];
        const text = await ui.text({ label: `${ui.t('Reorder Levels for')} ${n}: ${ui.t('New order')} (${levels.join(', ')})`, def: levels.join(', '),
          validate: s => splitList(s.replace(/\s*,\s*/g, ',')).length ? undefined : ui.t('A value is required.') });
        if (text === undefined) return false;
        v.orders[n] = text.split(',').map(s => s.trim()).filter(Boolean);
      }
      return true;
    },
    code: (v, c) => within(c, v.vars.map(n => `  ${S(newName(v, n))} <- factor(${S(n)}, levels=c(${quoted(v.orders[n])})${v.flags.ordered ? ', ordered=TRUE' : ''})`).join('\n'))
  }
};

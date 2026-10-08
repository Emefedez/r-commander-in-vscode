// "Index Numbers" menu of the RcmdrPlugin.TeachStat plug-in (functions Sindex, ComplexIN, priceIndexNum, Deflat).
const { rs, rc, S, splitList } = require('../lib/rhelpers');
const { numVar, numVars } = require('./common');

const lines = (...parts) => parts.flat().filter(Boolean).join('\n');
const first = value => [].concat(value || [])[0];
// The base is one of the values of the base variable (a year, a period...), listed from the data.
const baseLevels = (of, label) => ({ k: 'base', type: 'rlist', of, single: true, selectFirst: true, label,
  exprFor: (x, c) => `as.character(unique(${c.ds}$${S(x)}))` });
const baseVariable = { k: 'basevar', type: 'var', kind: 'any', label: 'Base variable (pick one)' };
const addToFrame = [
  { k: 'flags', type: 'flags', label: 'Add to data frame', items: [['add', 'Add to data frame', false]] },
  { k: 'name', type: 'name', label: 'Variable name:', def: 'Index', when: v => v.flags.add }];

// Sindex(data, base variable, value variable, base)*100, optionally saved as a variable of the data set.
const simpleIndex = (valueLabel, baseLabel) => ({
  fields: [numVar('value', valueLabel), { ...baseVariable, exclude: ['value'] }, baseLevels('basevar', baseLabel), ...addToFrame],
  code: (v, c) => lines('local({', `  .Sindex <- Sindex(${c.ds}, "${v.basevar}", "${v.value}", "${first(v.base)}")*100`, '  print(.Sindex)',
    v.flags.add && `  ${c.ds}$${S(v.name)} <<- drop(as.matrix(.Sindex))`, '})')
});

module.exports = {
  Sindexnumbers: simpleIndex('Value variable (pick one)', 'Base (pick one)'),
  BCindexnumbers: simpleIndex('Index variable (pick one)', 'New base (pick one)'),
  Cindexnumbers: {
    fields: [numVars('xs', 'Variables (pick one or more)'),
      { k: 'means', type: 'flags', label: 'Aggregation method', items: [['arithmetic', 'Arithmetic mean', true], ['geometric', 'Geometric mean', false], ['harmonic', 'Harmonic mean', false]] }],
    check: v => (Object.values(v.means).some(Boolean) ? undefined : 'No aggregation method selected.'),
    code: (v, c) => `ComplexIN(${c.ds}[,${v.xs.length === 1 ? rs(v.xs[0]) : rc(v.xs)}, drop=FALSE], means=c(${Object.keys(v.means).filter(k => v.means[k]).map(rs).join(', ')}))`
  },
  Pindexnumbers: {
    fields: [{ k: 'prod', type: 'var', kind: 'any', label: 'Product variable (pick one)' }, { ...baseVariable, exclude: ['prod'] }, baseLevels('basevar', 'Base (pick one)'),
      numVar('price', 'Price variable (pick one)'), numVar('qty', 'Quantity variable (pick one)', { exclude: ['price'] }),
      { k: 'methods', type: 'flags', label: 'Aggregation method', items: [['laspeyres', 'Laspeyres', true], ['paasche', 'Paasche', true], ['fisher', 'Fisher', false], ['other', 'Other:', false]] },
      { k: 'other', type: 'text', def: '', label: 'Other:', pattern: /^[\w.,\s]*$/, error: 'Enter names separated by commas.', sample: 'walsh', when: v => v.methods.other },
      { k: 'flags', type: 'flags', label: 'Save as a new data frame:', items: [['save', 'Save as a new data frame:', false]] },
      { k: 'name', type: 'name', label: 'name:', def: 'PriceIndex', when: v => v.flags.save }],
    check: v => (!Object.values(v.methods).some(Boolean) ? 'No aggregation method selected.' : v.methods.other && !splitList(v.other).length && Object.values(v.methods).filter(Boolean).length === 1 ? 'No other aggregation method was selected.' : undefined),
    activeDataset: v => (v.flags.save ? v.name : undefined),
    code(v, c) {
      const methods = [...['laspeyres', 'paasche', 'fisher'].filter(k => v.methods[k]), ...(v.methods.other ? splitList(v.other) : [])];
      return lines('local({', `  .df <- priceIndexNum (${c.ds}, prodID ="${v.prod}", pervar ="${v.basevar}", pvar ="${v.price}", qvar ="${v.qty}", base="${first(v.base)}", indexMethod =c(${methods.map(rs).join(', ')}))`,
        '  .df[,-1] <- .df[,-1]*100', '  print(.df)', v.flags.save && `  ${v.name} <<- .df`, '})');
    }
  },
  Deflation: {
    fields: [numVar('value', 'Current value (pick one)'), numVar('deflator', 'Deflator (pick one)', { exclude: ['value'] }), { ...baseVariable, exclude: ['value', 'deflator'] }, baseLevels('basevar', 'Base (pick one)'), ...addToFrame],
    code: (v, c) => lines('local({', `  .Deflator <- Deflat(${c.ds}, "${v.basevar}", "${v.value}", "${v.deflator}", "${first(v.base)}")`, '  print(.Deflator)',
      v.flags.add && `  ${c.ds}$${S(v.name)} <<- drop(as.matrix(.Deflator))`, '})')
  }
};

// "Index Numbers" menu of the RcmdrPlugin.TeachStat plug-in (functions Sindex, ComplexIN, priceIndexNum, Deflat).
const { rs, rc, S, splitList } = require('../lib/rhelpers');
const { numVar, numVars } = require('./common');

const lines = (...parts) => parts.flat().filter(Boolean).join('\n');
const first = value => [].concat(value || [])[0];
// The base is one of the values of the base variable (a year, a period...), listed from the data.
const baseLevels = (of, label) => ({ k: 'base', type: 'rlist', of, single: true, selectFirst: true, label, compact: true,
  exprFor: (x, c) => `as.character(unique(${c.ds}$${S(x)}))` });
const baseVariable = { k: 'basevar', type: 'var', kind: 'factor', compact: true, label: 'Base variable (pick one)' };
// make.names() of R, for the default variable name index_<base>.
const makeName = s => (/^[A-Za-z.]/.test(s) ? s : `X${s}`).replace(/[^A-Za-z0-9._]/g, '.');
const addToFrame = [
  { k: 'flags', type: 'flags', label: '', items: [['add', 'Add to data frame', false]] },
  { k: 'name', type: 'name', label: 'Variable name:', def: (c, v) => `index_${makeName(String(first(v.base) || ''))}`, when: v => v.flags.add }];

// Sindex(data, base variable, value variable, base)*100, optionally saved as a variable of the data set.
const simpleIndex = (valueLabel, baseLabel) => ({
  fields: [numVar('value', valueLabel, { compact: true }), { ...baseVariable, exclude: ['value'] }, baseLevels('basevar', baseLabel), ...addToFrame],
  code: (v, c) => lines('local({', `  .Sindex <- Sindex(${c.ds}, "${v.basevar}", "${v.value}", "${first(v.base)}")*100`, '  print(.Sindex)',
    v.flags.add && `  ${c.ds}$${S(v.name)} <<- drop(as.matrix(.Sindex))`, '})')
});

module.exports = {
  Sindexnumbers: simpleIndex('Value variable (pick one)', 'Base (pick one)'),
  BCindexnumbers: simpleIndex('Index variable (pick one)', 'New base (pick one)'),
  Cindexnumbers: {
    fields: [numVars('xs', 'Variables (pick one or more)'),
      { k: 'means', type: 'flags', label: 'Aggregation Method', items: [['arithmetic', 'Arithmetic', false], ['geometric', 'Geometric', false], ['harmonic', 'Harmonic', false]] }],
    check: v => (Object.values(v.means).some(Boolean) ? undefined : 'No aggregation method selected.'),
    code: (v, c) => `ComplexIN(${c.ds}[,${v.xs.length === 1 ? rs(v.xs[0]) : rc(v.xs)}, drop=FALSE], means=c(${Object.keys(v.means).filter(k => v.means[k]).map(rs).join(', ')}))`
  },
  Pindexnumbers: {
    fields: [{ ...baseVariable }, baseLevels('basevar', 'Base (pick one)'),
      { k: 'prod', type: 'var', kind: 'factor', compact: true, exclude: ['basevar'], label: 'Product variable (pick one)' },
      numVar('price', 'Price variable (pick one)', { compact: true }), numVar('qty', 'Quantity variable (pick one)', { exclude: ['price'], compact: true }),
      { k: 'methods', type: 'flags', label: 'Aggregation Method', items: [['laspeyres', 'Laspeyres', true], ['paasche', 'Paasche', false], ['fisher', 'Fisher', false], ['other', 'Other:', false]] },
      { k: 'other', type: 'text', def: '', label: '', prompt: 'Other:', pattern: /^[\w.,\s]*$/, error: 'Enter names separated by commas.', sample: 'walsh', when: v => v.methods.other },
      { k: 'flags', type: 'flags', label: 'Save as a new data frame:', items: [['save', 'Save as a new data frame:', false]] },
      { k: 'name', type: 'name', label: 'name:', def: 'PriceIndex', when: v => v.flags.save }],
    // As TeachStat, the new data frame is also saved to a file.
    async after(v, ui) {
      if (!v.flags.save) return true;
      v.file = await ui.file({ mode: 'save', filters: { 'R Data Files': ['RData', 'rda', 'Rda', 'RDA'], 'All Files': ['*'] }, def: `${v.name}.RData` }, ui.t('Save as a new data frame:'));
      return Boolean(v.file);
    },
    check: v => (!Object.values(v.methods).some(Boolean) ? 'No aggregation method selected.' : v.methods.other && !splitList(v.other).length && Object.values(v.methods).filter(Boolean).length === 1 ? 'No other aggregation method was selected.' : undefined),
    activeDataset: v => (v.flags.save ? v.name : undefined),
    code(v, c) {
      const methods = [...['laspeyres', 'paasche', 'fisher'].filter(k => v.methods[k]), ...(v.methods.other ? splitList(v.other) : [])];
      return lines('local({', `  .df <- priceIndexNum (${c.ds}, prodID ="${v.prod}", pervar ="${v.basevar}", pvar ="${v.price}", qvar ="${v.qty}", base="${first(v.base)}", indexMethod =c(${methods.map(rs).join(', ')}))`,
        '  .df[,-1] <- .df[,-1]*100', '  print(.df)', v.flags.save && `  ${v.name} <<- .df`, v.flags.save && `  save("${v.name}",file="${String(v.file).replace(/\.RData\.RData$/, '.RData')}")`, '})');
    }
  },
  Deflation: {
    fields: [numVar('value', 'Current value (pick one)', { compact: true }), numVar('deflator', 'Deflator (pick one)', { exclude: ['value'], compact: true }), { ...baseVariable, exclude: ['value', 'deflator'] }, baseLevels('basevar', 'Base (pick one)'), ...addToFrame],
    code: (v, c) => lines('local({', `  .Deflator <- Deflat(${c.ds}, "${v.basevar}", "${v.value}", "${v.deflator}", "${first(v.base)}")`, '  print(.Deflator)',
      v.flags.add && `  ${c.ds}$${S(v.name)} <<- drop(as.matrix(.Deflator))`, '})')
  }
};

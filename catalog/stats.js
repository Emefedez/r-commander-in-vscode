const { rs, rbool, isNumber } = require('../lib/rhelpers');

// The Statistics menu, dialog by dialog as in Rcmdr: same fields, labels, defaults and generated code.
const model = prefix => ({ activeModel: v => v.name, fresh: prefix });
const lines = (...parts) => parts.flat().filter(x => x !== false && x !== undefined && x !== null && x !== '').join('\n');
const quoted = xs => xs.map(x => `"${x}"`);
const vec = xs => (xs.length === 1 ? `"${xs[0]}"` : `c(${quoted(xs).join(', ')})`);
const lib = pkg => `library(${pkg})`;
const check = (k, text, on = false) => ({ k, type: 'flags', label: '', items: [[k, text, on]] });
const heading = (k, text, when) => ({ k, type: 'note', heading: true, label: text, ...(when && { when }) });
const nameField = prefix => ({ k: 'name', type: 'name', label: 'Enter name for model:', def: c => c.fresh(prefix) });
const ALL_CASES = '<all valid cases>';
const subsetField = { k: 'subset', type: 'text', optional: true, def: ALL_CASES, label: 'Subset expression', sample: 'n1 > 0.5' };
const subsetArg = v => (v.subset && v.subset.trim() && v.subset.trim() !== ALL_CASES ? `, subset=${v.subset.trim()}` : '');
const weightsField = { k: 'w', type: 'var', kind: 'numeric', optional: true, compact: true, label: 'Weights' };
const weightsArg = v => (v.w ? `, weights=${v.w}` : '');
const formulaField = (extra = {}) => ({ k: 'formula', type: 'formula', label: 'Model Formula', ...extra });
const formulaOf = v => `${v.formula.lhs} ~ ${v.formula.rhs}`;
const conf = (label = 'Confidence Level: ', def = '.95') => ({ k: 'conf', type: 'num', label, def, min: 0.0001, max: 0.9999 });
const choice = (k, label, choices, def) => ({ k, type: 'choice', label, choices, ...(def !== undefined && { def }) });
const alternative = (less = 'Difference < 0', greater = 'Difference > 0', two = 'Two-sided') =>
  choice('alt', 'Alternative Hypothesis', [['two.sided', two], ['less', less], ['greater', greater]]);
const wilcoxType = choice('test', 'Type of Test', [['default', 'Default'], ['exact', 'Exact'], ['normal', 'Normal approximation'], ['correct', 'Normal approximation with\ncontinuity correction']]);
const percents = (withTotal = true) => choice('percents', 'Compute Percentages',
  [['row', 'Row percentages'], ['column', 'Column percentages'], ...(withTotal ? [['total', 'Percentages of total']] : []), ['none', 'No percentages']], 'none');
const testsFlags = (label = 'Hypothesis Tests') => ({ k: 'tests', type: 'flags', label,
  items: [['chisq', 'Chi-square test of independence', true], ['comp', 'Components of chi-square statistic', false], ['expected', 'Print expected frequencies', false], ['fisher', 'Fisher\'s exact test', false]] });
// A fraction such as 1/3 typed in a probability box.
const fraction = text => { const m = String(text).trim().match(/^([-+]?[\d.]+(?:e[-+]?\d+)?)\s*\/\s*([\d.]+(?:e[-+]?\d+)?)$/i); return m ? Number(m[1]) / Number(m[2]) : isNumber(String(text)) ? Number(text) : NaN; };
const slider = (k, label, min, max, def) => ({ k, type: 'num', int: true, min, max, def: String(def), label });

// Rcmdr's GLM families, the links each one offers and its canonical link.
const FAMILIES = ['gaussian', 'binomial', 'poisson', 'Gamma', 'inverse.gaussian', 'quasibinomial', 'quasipoisson'];
const LINKS = { gaussian: ['identity', 'inverse', 'log'], binomial: ['logit', 'probit', 'cloglog'], poisson: ['identity', 'log', 'sqrt'],
  Gamma: ['identity', 'inverse', 'log'], 'inverse.gaussian': ['identity', 'inverse', 'log', '1/mu^2'], quasibinomial: ['logit', 'probit', 'cloglog'], quasipoisson: ['identity', 'log', 'sqrt'] };
const CANONICAL = { gaussian: 'identity', binomial: 'logit', poisson: 'log', Gamma: 'inverse', 'inverse.gaussian': '1/mu^2', quasibinomial: 'logit', quasipoisson: 'log' };
const familyFields = [choice('family', 'Family (double-click to select)', FAMILIES.map(f => [f, f]), 'binomial'),
  { ...choice('link', 'Link function', v => (LINKS[v.family] || []).map(l => [l, l])), defFor: v => CANONICAL[v.family] }];
const expCoef = (v, name) => [(['binomial', 'quasibinomial'].includes(v.family) && v.link === 'logit') && `exp(coef(${name}))  # Exponentiated coefficients ("odds ratios")`,
  (['poisson', 'quasipoisson'].includes(v.family) && v.link === 'log') && `exp(coef(${name}))  # Exponentiated coefficients`];

// The "Options" tab of the repeated-measures dialogs.
const repeatedOptions = [
  heading('h3', 'Hypothesis Tests'),
  choice('testStatistic', 'Multivariate Test Statistic', [['Pillai', 'Pillai'], ['Wilks', 'Wilks'], ['Hotelling', 'Hotelling-Lawley'], ['Roy', 'Roy']]),
  choice('test', 'Tests to Perform', [['multivariate', 'Multivariate'], ['univariate', 'Univariate']]),
  heading('h4', 'Repeated-Measures Means'),
  check('plot', 'Plot response means by factors'), check('print', 'Print means and standard deviations by factors'),
  { k: 'bsfactors', type: 'var', kind: 'factor', multi: true, min: 0, label: 'Between-Subjects Factors (pick zero or more)' },
  { k: 'xvar', type: 'text', label: 'X-axis factor: ', def: '<auto>' },
  { k: 'trace', type: 'text', label: 'Trace factor: ', def: '<auto>' },
  { k: 'response', type: 'name', label: 'Response name: ', def: 'score' }];
const repeatedPlot = (v, c, responses, names, levels) => {
  if (!v.plot.plot && !v.print.print) return false;
  const between = v.bsfactors.length ? `, between.names=c(${quoted(v.bsfactors).join(', ')})` : '';
  const trace = v.trace.trim() === '<auto>' || !v.trace.trim() ? '' : `, trace="${v.trace.trim()}"`;
  const xvar = v.xvar.trim() === '<auto>' || !v.xvar.trim() ? '' : `, xvar="${v.xvar.trim()}"`;
  const withinNames = names.length === 1 ? `"${names[0]}"` : `c(${quoted(names).join(', ')})`;
  return `repeatedMeasuresPlot(${c.ds}, within=c(${quoted(responses).join(', ')}), within.names=${withinNames}, within.levels=list(` +
    names.map((n, i) => `${n}=c(${quoted(levels[i]).join(', ')})`).join(', ') + `), print.tables=${rbool(v.print.print)}, plot.means=${rbool(v.plot.plot)}${between}${trace}${xvar}, response.name="${v.response}")`;
};
const anovaRM = (v, c, responses, idata, idesign) => {
  const formula = `cbind(${responses.join(', ')}) ~ ${v.formula.rhs || '1'}`;
  return v.test === 'multivariate'
    ? `Anova(lm(${formula}, data=${c.ds}), idata=${idata}, idesign = ~${idesign}, test.statistic="${v.testStatistic}")`
    : `summary(Anova(lm(${formula}, data=${c.ds}), idata=${idata}, idesign = ~${idesign}), univariate=TRUE, multivariate=FALSE)`;
};

const CFA_SLOTS = [1, 2, 3, 4, 5, 6];
const CFA_INDICES = ['AIC', 'BIC', 'GFI', 'AGFI', 'RMSEA', 'NFI', 'NNFI', 'CFI', 'RNI', 'IFI', 'SRMR', 'AICc', 'CAIC'];

// The model matrix an hclust solution was computed from, read back from its call (as Rcmdr does).
const hclustMatrix = h => `local({ cl <- ${h}$call$d; while (is.call(cl) && !identical(cl[[1]], as.name("model.matrix"))) cl <- cl[[2]]; paste(deparse(cl, width.cutoff = 500), collapse = " ") })`;
const clusterMatrix = (v, c) => {
  const dset = v.subset.trim() === ALL_CASES || !v.subset.trim() ? c.ds : `${c.ds}[${c.ds}$${v.subset.trim()}, ]`;
  return [dset, (sep) => `model.matrix(~-1 + ${v.xs.join(sep)}, ${dset})`];
};

const tests = {
  summarizeDataSet: { code: (v, c) => `summary(${c.ds})` },
  numericalSummaries: {
    fields: [{ k: 'xs', type: 'var', kind: 'numeric', multi: true, label: 'Variables (pick one or more)' },
      { k: 'g', type: 'var', kind: 'factor', optional: true, label: 'Summarize by groups' },
      { k: 'stats', type: 'flags', label: '', items: [['mean', 'Mean', true], ['sd', 'Standard Deviation', true], ['se(mean)', 'Standard Error of Mean', false],
        ['var', 'Variance', false], ['IQR', 'Interquartile Range', true], ['cv', 'Coefficient of Variation', false], ['counts', 'Frequency Counts', false]] },
      check('quantiles', 'Quantiles:', true),
      { k: 'q', type: 'text', label: '', prompt: 'Quantiles:', def: '0, .25, .5, .75, 1', when: v => v.quantiles.quantiles },
      { k: 'sk', type: 'flags', label: '', items: [['skewness', 'Skewness', false], ['kurtosis', 'Kurtosis', false]] },
      choice('type', '', [['1', 'Type 1'], ['2', 'Type 2'], ['3', 'Type 3']], '2')],
    check: v => (!Object.values(v.stats).some(Boolean) && !v.quantiles.quantiles && !Object.values(v.sk).some(Boolean) ? 'No statistics selected.' : undefined),
    // Frequency counts by groups go level by level.
    async after(v, ui) { v.levels = v.stats.counts && v.g ? await ui.query(`levels(as.factor(${ui.ctx.ds}$${v.g}))`) || [] : []; return true; },
    code(v, c) {
      const order = ['mean', 'sd', 'se(mean)', 'var', 'IQR', 'quantiles', 'cv', 'skewness', 'kurtosis'];
      const on = { ...v.stats, quantiles: v.quantiles.quantiles, ...v.sk };
      const stats = order.filter(s => on[s]);
      const quants = `c(${(v.q || '').replace(/ /g, ',').replace(/,+/g, ',')})`;
      const type = on.skewness || on.kurtosis ? `, type="${v.type}"` : '';
      const ds = `${c.ds}[,${vec(v.xs)}, drop=FALSE]`;
      const out = [];
      if (stats.length) out.push(`numSummary(${ds}, ${v.g ? `groups=${c.ds}$${v.g}, ` : ''}statistics=c(${quoted(stats).join(', ')}), quantiles=${quants}${type})`);
      if (v.stats.counts) {
        const discrete = v.xs.filter(x => c.isDiscrete?.(x)), continuous = v.xs.filter(x => !c.isDiscrete?.(x));
        const sel = xs => (xs.length === 1 ? `"${xs[0]}"` : `c(${quoted(xs).join(', ')})`);
        if (v.g) {
          for (const level of v.levels) {
            if (continuous.length) out.push(`binnedCounts(${c.ds}[${c.ds}$${v.g} == '${level}', ${sel(continuous)}, drop=FALSE])\n  # ${v.g} = ${level}`);
            if (discrete.length) out.push(`discreteCounts(${c.ds}[${c.ds}$${v.g} == '${level}', ${sel(discrete)}, drop=FALSE])\n  # ${v.g} = ${level}`);
          }
        } else {
          if (continuous.length) out.push(`binnedCounts(${c.ds}[,${sel(continuous)}, drop=FALSE])`);
          if (discrete.length) out.push(`discreteCounts(${c.ds}[,${sel(discrete)}, drop=FALSE])`);
        }
      }
      return out.join('\n');
    } },
  frequencyDistribution: {
    fields: [{ k: 'xs', type: 'var', kind: 'factor', multi: true, label: 'Variables (pick one or more)' },
      check('gof', 'Chi-square goodness-of-fit test (for one variable only)')],
    check: v => (v.xs.length > 1 && v.gof.gof ? 'Goodness-of-fit test not available when more than one variable is selected.' : undefined),
    // "Goodness-of-Fit Test": a hypothesized probability for each level, 1/k by default.
    async after(v, ui) {
      if (!v.gof.gof) return true;
      const levels = await ui.query(`levels(as.factor(${ui.ctx.ds}$${v.xs[0]}))`) || [];
      v.probs = [];
      for (const level of levels) {
        const text = await ui.text({ label: `${ui.t('Goodness-of-Fit Test')} — ${ui.t('Hypothesized probabilities:   ')} ${level}`, def: `1/${levels.length}`,
          validate: s => fraction(s) >= 0 ? undefined : ui.t('Probabilities must be non-negative.') });
        if (text === undefined) return false;
        v.probs.push(fraction(text));
      }
      const sum = v.probs.reduce((a, b) => a + b, 0);
      if (Math.abs(sum - 1) > 0.001) v.probs = v.probs.map(p => p / sum);
      return true;
    },
    code: (v, c) => v.xs.map(x => lines(`local({\n  .Table <- with(${c.ds}, table(${x}))`, '  cat("\\ncounts:\\n")', '  print(.Table)',
      '  cat("\\npercentages:\\n")', '  print(round(100*.Table/sum(.Table), 2))',
      v.gof.gof ? `  .Probs <- c(${v.probs.join(',')}) \n  chisq.test(.Table, p=.Probs)\n})` : '})')).join('\n') },
  countMissing: { code: (v, c) => `sapply(${c.ds}, function(x)(sum(is.na(x)))) # NA counts` },
  statisticsTable: {
    fields: [{ k: 'gs', type: 'var', kind: 'factor', multi: true, label: 'Factors (pick one or more)' },
      { k: 'ys', type: 'var', kind: 'numeric', multi: true, label: 'Response variables (pick one or more)' },
      choice('stat', 'Statistic', [['mean', 'Mean'], ['median', 'Median'], ['sd', 'Standard deviation'], ['IQR', 'Interquartile range'], ['other', 'Other (specify)']]),
      { k: 'other', type: 'text', label: '', prompt: 'Other (specify)', def: '', optional: true, sample: 'max', when: v => v.stat === 'other' }],
    check: v => (v.stat === 'other' && !v.other.trim() ? 'A value is required.' : undefined),
    code(v, c) {
      const stat = v.stat === 'other' ? v.other.trim() : v.stat;
      return v.ys.map(y => lines(v.ys.length > 1 && `# Table for ${y}:`,
        `Tapply(${y} ~ ${v.gs.join(' + ')}, ${stat}, na.action=na.omit, data=${c.ds}) # ${stat} by groups`)).join('\n');
    } },
  correlationMatrix: {
    fields: [{ k: 'xs', type: 'var', kind: 'numeric', multi: true, min: 2, label: 'Variables (pick two or more)' },
      choice('type', 'Type of Correlations', [['Pearson', 'Pearson product-moment'], ['Spearman', 'Spearman rank-order'], ['partial', 'Partial']]),
      choice('use', 'Observations to Use', [['complete', 'Complete observations'], ['pairwise.complete', 'Pairwise-complete observations']]),
      check('p', 'Pairwise p-values')],
    check: v => (v.type === 'partial' && v.xs.length < 3 ? 'Fewer than 3 variables selected\nfor partial correlations.' : undefined),
    code(v, c) {
      const data = `${c.ds}[,c(${quoted(v.xs).join(',')})]`;
      if (v.type === 'partial') return `partial.cor(${data}${v.p.p ? ', tests=TRUE' : ''}, use="${v.use}")`;
      if (!v.p.p) return `cor(${data}${v.type === 'Spearman' ? ', method="spearman"' : ''}, use="${v.use}")`;
      return lines(lib('Hmisc'), `rcorr.adjust(${data}, type="${v.type.toLowerCase()}", use="${v.use}")`);
    } },
  correlationTest: {
    fields: [{ k: 'xs', type: 'var', kind: 'numeric', multi: true, min: 2, max: 2, label: 'Variables (pick two)' },
      choice('method', 'Type of Correlation', [['pearson', 'Pearson product-moment'], ['spearman', 'Spearman rank-order'], ['kendall', 'Kendall\'s tau']]),
      alternative('Correlation < 0', 'Correlation > 0')],
    code: (v, c) => `with(${c.ds}, cor.test(${v.xs[0]}, ${v.xs[1]}, alternative="${v.alt}", method="${v.method}"))` },
  NormalityTest: {
    fields: [{ k: 'x', type: 'var', kind: 'numeric', label: 'Variable (pick one)' },
      choice('test', 'Normality Test', [['shapiro.test', 'Shapiro-Wilk'], ['ad.test', 'Anderson-Darling'], ['cvm.test', 'Cramer-von Mises'],
        ['lillie.test', 'Lilliefors (Kolmogorov-Smirnov)'], ['sf.test', 'Shapiro-Francia'], ['pearson.test', 'Pearson chi-square']]),
      { k: 'bins', type: 'text', label: 'Number of bins\nfor Pearson chi-square', def: '<auto>', compact: true },
      { k: 'g', type: 'var', kind: 'factor', optional: true, label: 'Test by groups' }],
    check: v => (v.bins.trim() !== '<auto>' && !(Number(v.bins) >= 4) ? 'Number of bins must be a number >= 4' : undefined),
    code(v, c) {
      const bins = v.test !== 'pearson.test' || v.bins.trim() === '<auto>' ? '' : `, n.classes=${v.bins.trim()}`;
      return v.g ? `normalityTest(${v.x} ~ ${v.g}, test="${v.test}", data=${c.ds}${bins})` : `normalityTest(~${v.x}, test="${v.test}", data=${c.ds}${bins})`;
    } },
  transformVariables: {
    fields: [{ k: 'xs', type: 'var', kind: 'numeric', multi: true, label: 'Select variables to transform (one or more)' },
      choice('family', 'Transformation Family', [['bcPower', 'Box-Cox'], ['bcnPower', 'Box-Cox with negatives'], ['yjPower', 'Yeo-Johnson']]),
      formulaField({ label: '', prompt: 'Model Formula', hasLhs: false, optional: true })],
    code: (v, c) => `summary(powerTransform(${v.xs.length > 1 ? `cbind(${v.xs.join(', ')})` : v.xs[0]} ~ ${v.formula.rhs || '1'}, data=${c.ds}, family="${v.family}"))` },

  twoWayTable: {
    fields: [{ k: 'row', type: 'var', kind: 'factor', label: 'Row variable (pick one)' },
      { k: 'col', type: 'var', kind: 'factor', exclude: ['row'], label: 'Column variable (pick one)' }, subsetField,
      percents(), testsFlags()],
    code(v, c) {
      const t = v.tests;
      return lines(`local({\n  .Table <- xtabs(~${v.row}+${v.col}, data=${c.ds}${subsetArg(v)})\n  cat("\\nFrequency table:\\n")\n  print(.Table)`,
        v.percents === 'row' && '  cat("\\nRow percentages:\\n")\n  print(rowPercents(.Table))',
        v.percents === 'column' && '  cat("\\nColumn percentages:\\n")\n  print(colPercents(.Table))',
        v.percents === 'total' && '  cat("\\nTotal percentages:\\n")\n  print(totPercents(.Table))',
        t.chisq && '  .Test <- chisq.test(.Table, correct=FALSE)\n  print(.Test)',
        t.chisq && t.expected && '  cat("\\nExpected counts:\\n")\n  print(.Test$expected)',
        t.chisq && t.comp && '  cat("\\nChi-square components:\\n")\n  print(round(.Test$residuals^2, 2))',
        t.fisher && '  print(fisher.test(.Table))', '})');
    } },
  twoWayTableFromCounts: {
    fields: [{ k: 'row', type: 'var', kind: 'factor', label: 'Row variable' }, { k: 'col', type: 'var', kind: 'factor', exclude: ['row'], label: 'Column variable' },
      { k: 'count', type: 'var', kind: 'numeric', label: 'Count variable' }, percents(), testsFlags()],
    code(v, c) {
      const t = v.tests;
      return [`local({\n  .Table <- xtabs(${v.count}~${v.row}+${v.col}, data=${c.ds})\n  cat("\\nFrequency table:\\n")\n  print(addmargins(.Table))\n`,
        v.percents === 'row' && '  cat("\\nRow percentages:\\n")\n  print(rowPercents(.Table))\n',
        v.percents === 'column' && '  cat("\\nColumn percentages:\\n")\n  print(colPercents(.Table))\n',
        v.percents === 'total' && '  cat("\\nTotal percentages:\\n")\n  print(totPercents(.Table))\n',
        (t.chisq || t.expected || t.comp) && '  .Test <- chisq.test(.Table, correct=FALSE)\n', t.chisq && '  print(.Test)\n',
        t.expected && `  cat("${t.chisq ? '' : '\\n'}Expected counts:\\n")\n  print(.Test$expected)\n`,
        t.comp && '  cat("\\nChi-square components:\\n")\n  print(round(.Test$residuals^2, 2))\n',
        t.fisher && '  print(fisher.test(.Table))\n', '})'].filter(Boolean).join('');
    } },
  multiWayTable: {
    fields: [{ k: 'row', type: 'var', kind: 'factor', label: 'Row variable (pick one)' },
      { k: 'col', type: 'var', kind: 'factor', exclude: ['row'], label: 'Column variable (pick one)' },
      { k: 'controls', type: 'var', kind: 'factor', multi: true, exclude: ['row', 'col'], label: 'Control variable(s) (pick one or more)' },
      subsetField, percents(false)],
    code: (v, c) => lines(`local({\n  .Table <- xtabs(~${v.row}+${v.col}+${v.controls.join('+')}, data=${c.ds}${subsetArg(v)})\n  cat("\\nFrequency table:\\n")\n  print(.Table)`,
      v.percents === 'row' && '  cat("\\nRow percentages:\\n")\n  print(rowPercents(.Table))',
      v.percents === 'column' && '  cat("\\nColumn percentages:\\n")\n  print(colPercents(.Table))') + ' \n})' },
  enterTable: { ds: false,
    fields: [slider('nrows', 'Number of Rows:', 2, 10, 2), slider('ncols', 'Number of Columns:', 2, 10, 2),
      { k: 'rowvar', type: 'text', optional: true, label: 'Name for Row Variable (optional): ', def: '' },
      { k: 'colvar', type: 'text', optional: true, label: 'Name for Column Variable (optional): ', def: '' },
      { k: 'table', type: 'table', rowsOf: 'nrows', colsOf: 'ncols', label: 'Enter counts:' },
      percents(), testsFlags('Hypothesis Test')],
    code(v) {
      const { rows, cols, cells } = v.table, t = v.tests;
      const rowvar = v.rowvar.trim() || 'rows', colvar = v.colvar.trim() || 'columns';
      return lines(`.Table <- matrix(c(${cells.flat().join(',')}), ${rows.length}, ${cols.length}, byrow=TRUE)`,
        `dimnames(.Table) <- list("${rowvar}"=c(${quoted(rows).join(', ')}), "${colvar}"=c(${quoted(cols).join(', ')}))`, '.Table  # Counts',
        v.percents === 'row' && 'rowPercents(.Table) # Row Percentages', v.percents === 'column' && 'colPercents(.Table) # Column Percentages',
        v.percents === 'total' && 'totPercents(.Table) # Percentage of Total',
        t.chisq && '.Test <- chisq.test(.Table, correct=FALSE)', t.chisq && '.Test', t.chisq && t.expected && '.Test$expected # Expected Counts',
        t.chisq && t.comp && 'round(.Test$residuals^2, 2) # Chi-square Components', t.chisq && 'remove(.Test)',
        t.fisher && 'fisher.test(.Table)', 'remove(.Table)');
    } },

  singleSampleTTest: {
    fields: [{ k: 'x', type: 'var', kind: 'numeric', label: 'Variable (pick one)' },
      alternative('Population mean < mu0', 'Population mean > mu0', 'Population mean != mu0'),
      { k: 'mu', type: 'num', label: 'Null hypothesis: mu = ', def: '0.0' }, conf()],
    code: (v, c) => `with(${c.ds}, (t.test(${v.x}, alternative='${v.alt}', mu=${v.mu}, conf.level=${v.conf})))` },
  independentSamplesTTest: {
    fields: [{ k: 'g', type: 'var', kind: 'twolevel', label: 'Groups (pick one)' }, { k: 'y', type: 'var', kind: 'numeric', label: 'Response Variable (pick one)' },
      alternative(), conf('Confidence Level'), choice('eq', 'Assume equal variances?', [['TRUE', 'Yes'], ['FALSE', 'No']], 'FALSE')],
    code: (v, c) => `t.test(${v.y}~${v.g}, alternative='${v.alt}', conf.level=${v.conf}, var.equal=${v.eq}, data=${c.ds})` },
  pairedTTest: {
    fields: [{ k: 'x', type: 'var', kind: 'numeric', label: 'First variable (pick one)' }, { k: 'y', type: 'var', kind: 'numeric', exclude: ['x'], label: 'Second variable (pick one)' },
      alternative(), conf('Confidence Level')],
    code: (v, c) => `with(${c.ds}, (t.test(${v.x}, ${v.y}, alternative='${v.alt}', conf.level=${v.conf}, paired=TRUE)))` },
  oneWayAnova: { ...model('AnovaModel'),
    fields: [nameField('AnovaModel'), { k: 'g', type: 'var', kind: 'factor', label: 'Groups (pick one)' },
      { k: 'y', type: 'var', kind: 'numeric', label: 'Response Variable (pick one)' },
      check('pairwise', 'Pairwise comparisons of means'), conf('Confidence Level: ', '0.95'),
      check('welch', 'Welch F-test not assuming equal variances')],
    code(v, c) {
      const pairs = v.pairwise.pairwise && (c.nlevelsOf(v.g) ?? 3) >= 3;
      return lines(`${v.name} <- aov(${v.y} ~ ${v.g}, data=${c.ds})`, `summary(${v.name})`,
        `with(${c.ds}, numSummary(${v.y}, groups=${v.g}, statistics=c("mean", "sd")))`,
        pairs && lib('multcomp'),
        pairs && [`local({\n  .Pairs <- glht(${v.name}, linfct = mcp(${v.g} = "Tukey"))`, '  print(summary(.Pairs)) # pairwise tests',
          `  print(confint(.Pairs, level=${v.conf})) # confidence intervals`, `  print(cld(.Pairs, level=${+(1 - Number(v.conf)).toFixed(10)})) # compact letter display`,
          '  old.oma <- par(oma=c(0, 5, 0, 0))', '  plot(confint(.Pairs))', '  par(old.oma)\n})'].join('\n'),
        v.welch.welch && `oneway.test(${v.y} ~ ${v.g}, data=${c.ds}) # Welch test`);
    } },
  multiWayAnova: { ...model('AnovaModel'),
    fields: [nameField('AnovaModel'), { k: 'gs', type: 'var', kind: 'factor', multi: true, label: 'Factors (pick one or more)' },
      { k: 'y', type: 'var', kind: 'numeric', label: 'Response Variable (pick one)' }],
    code: (v, c) => lines(`${v.name} <- lm(${v.y} ~ ${v.gs.join('*')}, data=${c.ds}, contrasts=list(${v.gs.map(g => `${g} ="contr.Sum"`).join(', ')}))`,
      `Anova(${v.name})`, `Tapply(${v.y} ~ ${v.gs.join(' + ')}, mean, na.action=na.omit, data=${c.ds}) # means`,
      `Tapply(${v.y} ~ ${v.gs.join(' + ')}, sd, na.action=na.omit, data=${c.ds}) # std. deviations`, `xtabs(~ ${v.gs.join(' + ')}, data=${c.ds}) # counts`) },
  // Tabs "Design" and "Options" of Rcmdr, one after the other.
  oneWayRepeatedMeasures: {
    fields: [heading('h1', 'Within-Subject Factor'),
      { k: 'wsfactor', type: 'name', label: 'Name for the within-subjects factor: ', def: 'Trials' },
      { k: 'n1', type: 'note', label: 'Specify up to 8 levels (responses) and level names for the within-subjects factor' },
      ...Array.from({ length: 8 }, (_, i) => [
        { k: `level${i + 1}`, type: 'text', label: '', prompt: `Level-${i + 1}`, def: `Level-${i + 1}`, compact: true },
        { k: `rm${i + 1}`, type: 'var', kind: 'numeric', optional: true, compact: true, label: '', prompt: `Level-${i + 1}` }]).flat(),
      heading('h2', 'Between-Subjects Model Formula'), formulaField({ label: '', prompt: 'Between-Subjects Model Formula', hasLhs: false, optional: true }),
      ...repeatedOptions],
    check(v) {
      const rms = Array.from({ length: 8 }, (_, i) => v[`rm${i + 1}`]).filter(Boolean);
      if (rms.length < 2) return 'You must specify at least 2 responses';
      return new Set(rms).size !== rms.length ? 'Duplicate responses' : undefined;
    },
    code(v, c) {
      const rms = Array.from({ length: 8 }, (_, i) => [v[`rm${i + 1}`], v[`level${i + 1}`]]).filter(p => p[0]);
      const idata = `data.frame(${v.wsfactor}=factor(c(${rms.map(p => `'${p[1]}'`).join(', ')})))`;
      return lines(anovaRM(v, c, rms.map(p => p[0]), idata, v.wsfactor), repeatedPlot(v, c, rms.map(p => p[0]), [v.wsfactor], [rms.map(p => p[1])]));
    } },
  twoWayRepeatedMeasures: {
    fields: [heading('h1', 'Within-Subject Factors'),
      { k: 'rowfactor', type: 'name', label: 'Name for the within-subjects row factor: ', def: 'RowFactor' },
      { k: 'colfactor', type: 'name', label: 'Name for the within-subjects column factor: ', def: 'ColumnFactor' },
      { k: 'n1', type: 'note', label: 'Select up to 5 levels and level-names for each within-subjects factor' },
      ...Array.from({ length: 5 }, (_, j) => ({ k: `col${j + 1}`, type: 'text', label: '', prompt: `Column-${j + 1}`, def: `Column-${j + 1}`, compact: true })),
      ...Array.from({ length: 5 }, (_, i) => [
        { k: `row${i + 1}`, type: 'text', label: '', prompt: `Row-${i + 1}`, def: `Row-${i + 1}`, compact: true },
        ...Array.from({ length: 5 }, (_, j) => ({ k: `rm${i + 1}${j + 1}`, type: 'var', kind: 'numeric', optional: true, compact: true, label: '', prompt: `Row-${i + 1} × Column-${j + 1}` }))]).flat(),
      heading('h2', 'Between-Subjects Model Formula'), formulaField({ label: '', prompt: 'Between-Subjects Model Formula', hasLhs: false, optional: true }),
      ...repeatedOptions],
    check(v) {
      const grid = Array.from({ length: 5 }, (_, i) => Array.from({ length: 5 }, (_, j) => Boolean(v[`rm${i + 1}${j + 1}`])));
      const nrow = grid.filter(r => r[0]).length, ncol = grid[0].filter(Boolean).length;
      if (nrow < 2 || ncol < 2) return 'at least 2 rows and 2 columns of responses must be specified';
      return grid.some((r, i) => r.some((x, j) => x !== (i < nrow && j < ncol))) ? 'responses must be specified in a rectangle starting at the top left' : undefined;
    },
    code(v, c) {
      const rows = [0, 1, 2, 3, 4].filter(i => v[`rm${i + 1}1`]), cols = [0, 1, 2, 3, 4].filter(j => v[`rm1${j + 1}`]);
      const responses = cols.flatMap(j => rows.map(i => v[`rm${i + 1}${j + 1}`]));
      const rowLevels = rows.map(i => v[`row${i + 1}`]), colLevels = cols.map(j => v[`col${j + 1}`]);
      const idata = `data.frame(${v.rowfactor} = factor(rep(c(${rowLevels.map(l => `'${l}'`).join(', ')}),${cols.length})), ` +
        `${v.colfactor} = factor(rep(c(${colLevels.map(l => `'${l}'`).join(', ')}), each=${rows.length})))`;
      return lines(anovaRM(v, c, responses, idata, `${v.rowfactor}*${v.colfactor}`),
        repeatedPlot(v, c, responses, [v.rowfactor, v.colfactor], [rowLevels, colLevels]));
    } },

  singleProportionTest: {
    fields: [{ k: 'x', type: 'var', kind: 'twolevel', label: 'Variable (pick one)' },
      alternative('Population proportion < p0', 'Population proportion > p0', 'Population proportion != p0'),
      { k: 'p', type: 'num', min: 0, max: 1, def: '.5', label: 'Null hypothesis: p = ' }, conf(),
      choice('test', 'Type of Test', [['normal', 'Normal approximation'], ['corrected', 'Normal approximation with\ncontinuity correction'], ['exact', 'Exact binomial']])],
    code(v, c) {
      const start = `local({\n  .Table <- xtabs(~ ${v.x} , data= ${c.ds} )\n  cat("\\nFrequency counts (test is for first level):\\n")\n  print(.Table)`;
      return v.test === 'exact' ? `${start}\n  binom.test(rbind(.Table), alternative='${v.alt}', p=${v.p}, conf.level=${v.conf})\n})`
        : `${start}\n  prop.test(rbind(.Table), alternative='${v.alt}', p=${v.p}, conf.level=${v.conf}, correct=${rbool(v.test === 'corrected')})\n})`;
    } },
  twoSampleProportionsTest: {
    fields: [{ k: 'g', type: 'var', kind: 'twolevel', label: 'Groups (pick one)' },
      { k: 'x', type: 'var', kind: 'twolevel', exclude: ['g'], label: 'Response Variable (pick one)' }, alternative(), conf(),
      choice('test', 'Type of Test', [['normal', 'Normal approximation'], ['corrected', 'Normal approximation with\ncontinuity correction']])],
    code: (v, c) => `local({  .Table <- xtabs(~${v.g}+${v.x}, data=${c.ds})\n  cat("\\nPercentage table:\\n")\n  print(rowPercents(.Table))` +
      `\n  prop.test(.Table, alternative='${v.alt}', conf.level=${v.conf}, correct=${rbool(v.test === 'corrected')})\n})` },

  twoVariancesFTest: {
    fields: [{ k: 'g', type: 'var', kind: 'twolevel', label: 'Groups (pick one)' }, { k: 'y', type: 'var', kind: 'numeric', label: 'Response Variable (pick one)' },
      alternative('Ratio < 1', 'Ratio > 1'), conf('Confidence Level:  ')],
    code: (v, c) => lines(`Tapply(${v.y} ~ ${v.g}, var, na.action=na.omit, data=${c.ds}) # variances by group`,
      `var.test(${v.y} ~ ${v.g}, alternative='${v.alt}', conf.level=${v.conf}, data=${c.ds})`) },
  BartlettTest: {
    fields: [{ k: 'gs', type: 'var', kind: 'factor', multi: true, label: 'Factors (pick one or more)' }, { k: 'y', type: 'var', kind: 'numeric', label: 'Response Variable (pick one)' }],
    code: (v, c) => (v.gs.length === 1
      ? lines(`Tapply(${v.y} ~ ${v.gs[0]}, var, na.action=na.omit, data=${c.ds}) # variances by group`, `bartlett.test(${v.y} ~ ${v.gs[0]}, data=${c.ds})`)
      : lines(`Tapply(${v.y} ~ ${v.gs.join(' + ')}, var, na.action=na.omit, data=${c.ds}) # variances`, `bartlett.test(${v.y} ~ interaction(${v.gs.join(', ')}), data=${c.ds})`)) },
  LeveneTest: {
    fields: [{ k: 'gs', type: 'var', kind: 'factor', multi: true, label: 'Factors (pick one or more)' }, { k: 'y', type: 'var', kind: 'numeric', label: 'Response Variable (pick one)' },
      choice('center', 'Center', [['median', 'median'], ['mean', 'mean']])],
    code: (v, c) => (v.gs.length === 1
      ? lines(`Tapply(${v.y} ~ ${v.gs[0]}, var, na.action=na.omit, data=${c.ds}) # variances by group`, `leveneTest(${v.y} ~ ${v.gs[0]}, data=${c.ds}, center="${v.center}")`)
      : lines(`Tapply(${v.y} ~ ${v.gs.join(' + ')}, var, na.action=na.omit, data=${c.ds}) # variances`, `leveneTest(${v.y} ~ ${v.gs.join('*')}, data=${c.ds}, center="${v.center}")`)) },

  twoSampleWilcoxonTest: {
    fields: [{ k: 'g', type: 'var', kind: 'twolevel', label: 'Groups (pick one)' }, { k: 'y', type: 'var', kind: 'numeric', label: 'Response Variable (pick one)' },
      alternative(), wilcoxType],
    code: (v, c) => lines(`Tapply(${v.y} ~ ${v.g}, median, na.action=na.omit, data=${c.ds}) # medians by group`,
      v.test === 'default' ? `wilcox.test(${v.y} ~ ${v.g}, alternative="${v.alt}", data=${c.ds})`
        : `wilcox.test(${v.y} ~ ${v.g}, alternative='${v.alt}', exact=${rbool(v.test === 'exact')}, correct=${rbool(v.test === 'correct')}, data=${c.ds})`) },
  onesampleWilcoxonTest: {
    fields: [{ k: 'x', type: 'var', kind: 'numeric', label: 'Variable (pick one)' }, alternative('mu < 0', 'mu > 0'), wilcoxType,
      { k: 'mu', type: 'num', label: 'Null hypothesis: mu =', def: '0.0' }],
    code: (v, c) => lines(`with(${c.ds}, median(${v.x}, na.rm=TRUE))`, `with(${c.ds}, mean(${v.x}, na.rm=TRUE))`,
      v.test === 'default' ? `with(${c.ds}, wilcox.test(${v.x}, alternative='${v.alt}', mu=${v.mu}))`
        : v.test === 'exact' ? `with(${c.ds}, wilcox.test(${v.x}, alternative='${v.alt}', mu=${v.mu}, exact=TRUE))`
          : `with(${c.ds}, wilcox.test(${v.x}, alternative='${v.alt}', mu=${v.mu}, correct=${rbool(v.test === 'correct')}, exact=FALSE))`) },
  pairedWilcoxonTest: {
    fields: [{ k: 'x', type: 'var', kind: 'numeric', label: 'First variable (pick one)' }, { k: 'y', type: 'var', kind: 'numeric', exclude: ['x'], label: 'Second variable (pick one)' },
      alternative(), wilcoxType],
    code: (v, c) => lines(`with(${c.ds}, median(${v.x} - ${v.y}, na.rm=TRUE)) # median difference`,
      v.test === 'default' ? `with(${c.ds}, wilcox.test(${v.x}, ${v.y}, alternative='${v.alt}', paired=TRUE))`
        : v.test === 'exact' ? `with(${c.ds}, wilcox.test(${v.x}, ${v.y}, alternative='${v.alt}', exact=TRUE, paired=TRUE))`
          : `with(${c.ds}, wilcox.test(${v.x}, ${v.y}, alternative='${v.alt}', correct=${rbool(v.test === 'correct')}, exact=FALSE, paired=TRUE))`) },
  KruskalWallisTest: {
    fields: [{ k: 'g', type: 'var', kind: 'factor', label: 'Groups (pick one)' }, { k: 'y', type: 'var', kind: 'numeric', label: 'Response Variable (pick one)' }],
    code: (v, c) => lines(`Tapply(${v.y} ~ ${v.g}, median, na.action=na.omit, data=${c.ds}) # medians by group`, `kruskal.test(${v.y} ~ ${v.g}, data=${c.ds})`) },
  FriedmanTest: {
    fields: [{ k: 'xs', type: 'var', kind: 'numeric', multi: true, min: 2, label: 'Repeated-Measures Variables (pick two or more)' }],
    code: (v, c) => `local({\n  .Responses <- na.omit(with(${c.ds}, cbind(${v.xs.join(', ')})))\n  cat("\\nMedians:\\n")\n  print(apply(.Responses, 2, median)) \n  friedman.test(.Responses)\n})` },

  Reliability: { fields: [{ k: 'xs', type: 'var', kind: 'numeric', multi: true, min: 3, label: 'Variables (pick three or more)' }],
    code: (v, c) => `reliability(cov(${c.ds}[,c(${quoted(v.xs).join(',')})], use="complete.obs"))` },
  principalComponents: {
    fields: [{ k: 'xs', type: 'var', kind: 'numeric', multi: true, min: 2, label: 'Variables (pick two or more)' }, subsetField,
      { k: 'opts', type: 'flags', label: '', items: [['correlations', 'Analyze correlation matrix', true], ['screeplot', 'Screeplot', false], ['addPC', 'Add principal components to data set', false]] }],
    check: v => (v.opts.addPC && v.subset.trim() && v.subset.trim() !== ALL_CASES ? 'Component scores are not available when subset is specified.' : undefined),
    // "Number of Components": how many to add to the data set.
    async after(v, ui) {
      if (!v.opts.addPC) return true;
      const n = await ui.text({ label: `${ui.t('Number of Components')} — ${ui.t('Number of components to retain:')} (1-${v.xs.length})`, def: '1',
        validate: s => /^\d+$/.test(s.trim()) && Number(s) >= 1 && Number(s) <= v.xs.length ? undefined : ui.t('The value must be at most {0}.', v.xs.length) });
      if (n === undefined) return false;
      v.ncomponents = Number(n);
      return true;
    },
    code(v, c) {
      const head = lines(`local({\n  .PC <- princomp(~${v.xs.join('+')}, cor=${rbool(v.opts.correlations)}, data=${c.ds}${subsetArg(v)})`, '  cat("\\nComponent loadings:\\n")',
        '  print(unclass(loadings(.PC)))', '  cat("\\nComponent variances:\\n")', '  print(.PC$sd^2)', '  cat("\\n")', '  print(summary(.PC))', v.opts.screeplot && '  screeplot(.PC)\n');
      const add = v.opts.addPC ? ['\n', `  ${c.ds} <<- within(${c.ds}, {`, ...Array.from({ length: v.ncomponents }, (_, i) => v.ncomponents - i).map(i => `    PC${i} <- .PC$scores[,${i}]`), '  })'].join('\n') : '';
      return `${head}${add}\n})`;
    } },
  factorAnalysis: {
    fields: [{ k: 'xs', type: 'var', kind: 'numeric', multi: true, min: 3, label: 'Variables (pick three or more)' }, subsetField,
      choice('rotation', 'Factor Rotation', [['none', 'None'], ['varimax', 'Varimax'], ['promax', 'Promax']], 'varimax'),
      choice('scores', 'Factor Scores', [['none', 'None'], ['Bartlett', 'Bartlett\'s method'], ['regression', 'Regression method']])],
    check: v => (v.scores !== 'none' && subsetArg(v) ? 'Factor scores are not available when subset is specified.' : undefined),
    // "Number of Factors": up to the most the variables allow.
    async after(v, ui) {
      const p = v.xs.length, max = Math.floor((2 * p + 1 - Math.sqrt(8 * p + 1)) / 2);
      if (max < 1) { await ui.vscode.window.showWarningMessage(ui.t('Too few variables selected')); return false; }
      if (max === 1) { v.nfactors = 1; return true; }
      const n = await ui.text({ label: `${ui.t('Number of Factors')} — ${ui.t('Number of factors to extract:')} (1-${max})`, def: '1',
        validate: s => /^\d+$/.test(s.trim()) && Number(s) >= 1 && Number(s) <= max ? undefined : ui.t('The value must be at most {0}.', max) });
      if (n === undefined) return false;
      v.nfactors = Number(n);
      return true;
    },
    code(v, c) {
      const head = `local({\n  .FA <- factanal(~${v.xs.join('+')}, factors=${v.nfactors}, rotation="${v.rotation}", scores="${v.scores}", data=${c.ds}${subsetArg(v)})\n  print(.FA)\n`;
      if (v.scores === 'none') return `${head}})`;
      const add = [`  ${c.ds} <<- within(${c.ds}, {`, ...Array.from({ length: v.nfactors }, (_, i) => v.nfactors - i).map(i => `    F${i} <- .FA$scores[,${i}]`), '  })'].join('\n');
      return `${head}${add}\n})`;
    } },
  // Rcmdr defines the factors one at a time with its "Define factor" button; here each factor has its slot.
  CFA: { pkgs: ['sem'],
    fields: [
      ...CFA_SLOTS.flatMap(k => [
        { k: `name${k}`, type: 'name', label: 'Name for factor:', def: `Factor.${k}`, when: v => k === 1 || (v[`vars${k - 1}`] || []).length >= 2 },
        { k: `vars${k}`, type: 'var', kind: 'numeric', multi: true, min: k === 1 ? 2 : 0, minOrNone: 2, label: 'Select variables\nloading on factor',
          when: v => k === 1 || (v[`vars${k - 1}`] || []).length >= 2 }]),
      choice('matrix', 'Matrix to Analyze', [['covariance', 'Covariance'], ['correlation', 'Correlation']]),
      choice('cor', 'Factor Correlations', [['correlated', 'Correlated'], ['orthogonal', 'Orthogonal']]),
      choice('identify', 'Identifying Constraints', [['factors', 'Factor variances set to 1'], ['loadings', 'First loading on each factor set to 1']]),
      { k: 'indices', type: 'flags', label: 'Fit Indices', items: CFA_INDICES.map(i => [i, i, i === 'AIC' || i === 'BIC']) },
      { k: 'robust', type: 'flags', label: ' ', items: [['robust', 'Robust standard errors', false]] }],
    code(v, c) {
      const factors = CFA_SLOTS.filter(k => (v[`vars${k}`] || []).length).map(k => [v[`name${k}`], v[`vars${k}`]]);
      const all = [...new Set(factors.flatMap(([, vs]) => vs))];
      const indices = CFA_INDICES.filter(i => v.indices[i]);
      return lines(lib('sem'), `local({\n  .model <- c(${factors.map(([n, vs]) => `'${n}: ${vs.join(', ')}'`).join(', ')})`,
        `  .model <- cfa(file=textConnection(.model), ${v.cor === 'correlated' ? '' : 'covs=NULL, '}reference.indicators=${rbool(v.identify === 'loadings')})`,
        `  .Data <- ${c.ds}[, c(${all.map(n => `'${n}'`).join(', ')})]`, v.matrix === 'correlation' && '  .Data <- as.data.frame(scale(.Data))',
        `  summary(sem(.model, data=.Data), robust=${rbool(v.robust.robust)}${indices.length ? `, fit.indices=c(${quoted(indices).join(',')})` : ''})\n})`);
    } },
  kmeansClustering: {
    fields: [{ k: 'xs', type: 'var', kind: 'numeric', multi: true, label: 'Variables (pick one or more)' }, subsetField,
      slider('k', 'Number of clusters:', 2, 10, 2), slider('seeds', 'Number of starting seeds:', 1, 20, 10), slider('iters', 'Maximum iterations:', 5, 30, 10),
      check('summary', 'Print cluster summary', true), check('plot', 'Bi-plot of clusters', true),
      check('assign', 'Assign clusters to\nthe data set         '),
      { k: 'variable', type: 'name', label: 'Assignment variable: ', def: 'KMeans', when: v => v.assign.assign }],
    code(v, c) {
      const [, xmat] = clusterMatrix(v, c), m = xmat(' + ');
      return lines(`.cluster <-  KMeans(${m}, centers = ${v.k}, iter.max = ${v.iters}, num.seeds = ${v.seeds})`,
        v.summary.summary && ['.cluster$size # Cluster Sizes', '.cluster$centers # Cluster Centroids', '.cluster$withinss # Within Cluster Sum of Squares',
          '.cluster$tot.withinss # Total Within Sum of Squares', '.cluster$betweenss # Between Cluster Sum of Squares'],
        v.plot.plot && `biplot(princomp(${m}), xlabs = as.character(.cluster$cluster))`,
        v.assign.assign && `${c.ds}$${v.variable} <- assignCluster(${m}, ${c.ds}, .cluster$cluster)`, 'remove(.cluster)');
    } },
  hierarchicalCluster: { activeHclust: true,
    fields: [{ k: 'name', type: 'name', label: 'Clustering solution name:', def: c => c.fresh('HClust') },
      { k: 'xs', type: 'var', kind: 'numeric', multi: true, label: 'Variables (pick one or more)' }, subsetField,
      choice('method', 'Clustering Method', [['ward', 'Ward\'s Method'], ['single', 'Single Linkage'], ['complete', 'Complete Linkage'], ['average', 'Average Linkage'],
        ['mcquitty', 'McQuitty\'s Method'], ['median', 'Median Linkage'], ['centroid', 'Centroid Linkage']]),
      choice('distance', 'Distance Measure', [['euc', 'Euclidean'], ['euc2', 'Squared-Euclidian'], ['city', 'Manhattan (City Block)'], ['none', 'No Transformation']]),
      check('dendro', 'Plot Dendrogram  ', true)],
    code(v, c) {
      const [dset, xmat] = clusterMatrix(v, c), m = xmat('+');
      const [dx, distlab] = { euc: [`dist(${m})`, 'euclidian'], euc2: [`dist(${m})^2`, 'squared-euclidian'], city: [`dist(${m}, method= "manhattan")`, 'city-block'], none: [m, 'untransformed'] }[v.distance];
      return lines(`${v.name} <- hclust(${dx} , method= "${v.method}")`,
        v.dendro.dendro && `plot(${v.name}, main= "Cluster Dendrogram for Solution ${v.name}", xlab= "Observation Number in Data Set ${dset}", sub="Method=${v.method}; Distance=${distlab}")`);
    } },
  hclustSummary: {
    fields: [{ k: 'h', type: 'hclust', label: 'Select One Clustering Solution' }, slider('k', 'Number of clusters:', 2, 10, 2),
      check('summary', 'Print cluster summary', true), check('plot', 'Bi-plot of clusters', true)],
    async after(v, ui) { v.xmat = (await ui.query(hclustMatrix(v.h)))?.[0]; return Boolean(v.xmat); },
    code(v) {
      const cl = `cutree(${v.h}, k = ${v.k})`;
      return lines(v.summary.summary && `summary(as.factor(${cl})) # Cluster Sizes`, v.summary.summary && `by(${v.xmat}, as.factor(${cl}), colMeans) # Cluster Centroids`,
        v.plot.plot && `biplot(princomp(${v.xmat}), xlabs = as.character(${cl}))`);
    } },
  appendHclustGroup: {
    fields: [{ k: 'h', type: 'hclust', label: 'Select One Clustering Solution' },
      { k: 'label', type: 'name', label: '  Assigned cluster label:', def: 'hclus.label' }, slider('k', '  Number of clusters:', 2, 10, 2)],
    async after(v, ui) { v.xmat = (await ui.query(hclustMatrix(v.h)))?.[0]; return Boolean(v.xmat); },
    code: (v, c) => `${c.ds}$${v.label} <- assignCluster(${v.xmat}, ${c.ds}, cutree(${v.h}, k = ${v.k}))` },

  linearRegressionModel: { ...model('RegModel'),
    fields: [{ k: 'xs', type: 'var', kind: 'numeric', multi: true, label: 'Explanatory variables (pick one or more)' },
      { k: 'y', type: 'var', kind: 'numeric', label: 'Response variable (pick one)' }, nameField('RegModel'), subsetField],
    check: v => (v.xs.includes(v.y) ? 'Response and explanatory variables must be different.' : undefined),
    code: (v, c) => lines(`${v.name} <- lm(${v.y}~${v.xs.join('+')}, data=${c.ds}${subsetArg(v)})`, `summary(${v.name})`) },
  linearModel: { ...model('LinearModel'),
    fields: [nameField('LinearModel'), formulaField(), subsetField, weightsField],
    code: (v, c) => lines(`${v.name} <- lm(${formulaOf(v)}, data=${c.ds}${subsetArg(v)}${weightsArg(v)})`, `summary(${v.name})`) },
  generalizedLinearModel: { ...model('GLM'),
    fields: [formulaField(), nameField('GLM'), subsetField, weightsField, ...familyFields],
    code: (v, c) => lines(`${v.name} <- glm(${formulaOf(v)}, family=${v.family}(${v.link}), data=${c.ds}${subsetArg(v)}${weightsArg(v)})`, `summary(${v.name})`, expCoef(v, v.name)) },
  multinomialLogitModel: { ...model('MLM'),
    fields: [nameField('MLM'), formulaField(), subsetField],
    code: (v, c) => lines(lib('nnet'), `${v.name} <- multinom(${formulaOf(v)}, data=${c.ds}${subsetArg(v)}, trace=FALSE)`, `summary(${v.name}, cor=FALSE, Wald=TRUE)`) },
  ordinalRegressionModel: { ...model('OrdRegModel'),
    fields: [nameField('OrdRegModel'), choice('type', 'Type of Model', [['logistic', 'Proportional-odds logit'], ['probit', 'Ordered probit']]), formulaField(), subsetField],
    code: (v, c) => lines(lib('MASS'), `${v.name} <- polr(${formulaOf(v)}, method="${v.type}", data=${c.ds}${subsetArg(v)}, Hess=TRUE)`, `summary(${v.name})`) },
  linearMixedModel: { ...model('LMM'),
    fields: [nameField('LMM'), choice('reml', 'Estimation Criterion', [['TRUE', 'Restricted maximum likelihood (REML)'], ['FALSE', 'Maximum likelihood (ML)']]),
      formulaField({ showBar: true }), subsetField, weightsField],
    code: (v, c) => lines(lib('lme4'), `${v.name} <- lmer(${formulaOf(v)}, data=${c.ds}${subsetArg(v)}${weightsArg(v)}, REML=${v.reml})`, `summary(${v.name})`) },
  generalizedLinearMixedModel: { ...model('GLMM'),
    fields: [formulaField({ showBar: true }), nameField('GLMM'), subsetField, weightsField, ...familyFields],
    code: (v, c) => lines(lib('lme4'), `${v.name} <- glmer(${formulaOf(v)}, family=${v.family}(${v.link}), data=${c.ds}${subsetArg(v)}${weightsArg(v)})`, `summary(${v.name})`, expCoef(v, v.name)) }
};

module.exports = tests;

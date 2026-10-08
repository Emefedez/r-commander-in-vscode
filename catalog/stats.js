const { rs, rc, rbool, S, splitList, rnums, isNumber } = require('../lib/rhelpers');
const { alt, conf, numVar, numVars, factor, factors, groups, twoLevel, anyVar, newName } = require('./common');

const flagsOf = (label, items) => ({ k: 'flags', type: 'flags', label, items });
const model = (prefix, assign) => ({ activeModel: v => v.name, fresh: prefix, assign });
const lines = (...parts) => parts.flat().filter(Boolean).join('\n');
// "Subset expression" and "Weights" as in Rcmdr's model dialogs.
const subsetField = { k: 'subset', type: 'text', optional: true, def: '<all valid cases>', label: 'Subset expression', sample: 'n1 > 0.5' };
const weightsField = numVar('w', 'Weights (optional)', { optional: true });
const hasSubset = v => v.subset !== undefined && v.subset.trim() !== '' && v.subset.trim() !== '<all valid cases>';
const subsetArg = v => (hasSubset(v) ? `, subset = ${v.subset.trim()}` : '');
const weightsArg = v => (v.w ? `, weights = ${S(v.w)}` : '');
const nameField = prefix => newName('name', prefix, 'Name for the model');
// a, b -> a ~ b with the response and the explanatory part already formed
const formulaOf = (response, rhs, c) => `${c.S(response)} ~ ${rhs}`;

// Means/standard deviations and a profile plot for the repeated-measures dialogs.
const repeatedExtras = (v, c) => [
  v.flags.means && `  print(rbind(Mean = colMeans(${c.cols(v.xs)}, na.rm = TRUE), SD = sapply(${c.cols(v.xs)}, sd, na.rm = TRUE)))`,
  v.flags.plot && `  .m <- colMeans(${c.cols(v.xs)}, na.rm = TRUE)\n  plot(seq_along(.m), .m, type = "b", xaxt = "n", xlab = "", ylab = "Mean")\n  axis(1, at = seq_along(.m), labels = names(.m))`
].filter(Boolean);

const tests = {
  summarizeDataSet: { code: (v, c) => `summary(${c.ds})` },
  numericalSummaries: { pkgs: ['RcmdrMisc', 'abind'],
    fields: [numVars('xs', 'Variables (pick one or more)'), groups('g', 'Summarize by groups (optional)'),
      flagsOf('Statistics', [['mean', 'Mean', true], ['sd', 'Standard deviation', true], ['se(mean)', 'Standard error of the mean', false], ['IQR', 'Interquartile range', false],
        ['cv', 'Coefficient of variation', false], ['skewness', 'Skewness', false], ['kurtosis', 'Kurtosis', false], ['quantiles', 'Quantiles', true]]),
      { k: 'q', type: 'numlist', label: 'Quantiles (between 0 and 1, separated by commas)', def: '0, .25, .5, .75, 1', when: v => v.flags.quantiles }],
    code(v, c) {
      const stats = Object.keys(v.flags).filter(k => v.flags[k]);
      if (!stats.length) stats.push('mean');
      return `RcmdrMisc::numSummary(${c.cols(v.xs)}, ${v.g ? `groups = ${c.dv(v.g)}, ` : ''}statistics = ${rc(stats)}${v.flags.quantiles ? `, quantiles = c(${v.q.join(', ')})` : ''})`;
    } },
  frequencyDistribution: {
    fields: [factors('gs', 'Variables (pick one or more)'), flagsOf('Options', [['test', 'Chi-square goodness-of-fit test (equal probabilities)', false]])],
    code: (v, c) => v.gs.map(g => lines(`local({`, `  .Table <- table(${c.dv(g)})`, `  cat("\\ncounts:\\n")`, `  print(.Table)`,
      `  cat("\\npercentages:\\n")`, `  print(round(100 * .Table / sum(.Table), 2))`,
      v.flags.test && `  print(chisq.test(.Table))`, `})`)).join('\n') },
  countMissing: { code: (v, c) => `sapply(${c.ds}, function(x) sum(is.na(x)))` },
  statisticsTable: {
    fields: [numVar('y', 'Response variable (numeric)'), factors('gs', 'Factors to tabulate by (pick one or more)'),
      { k: 'fun', type: 'choice', label: 'Statistic', choices: ['mean', 'median', 'sd', 'var', 'IQR', 'min', 'max', 'sum', 'length'].map(f => [f, f]) }],
    code: (v, c) => `tapply(${c.dv(v.y)}, list(${v.gs.map(g => `${S(g)} = ${c.dv(g)}`).join(', ')}), ${v.fun}${v.fun === 'length' ? '' : ', na.rm = TRUE'})` },
  correlationMatrix: { pkgs: ['RcmdrMisc'],
    fields: [numVars('xs', 'Variables (pick two or more)', 2),
      { k: 'type', type: 'choice', label: 'Type of correlations', choices: [['pearson', 'Pearson product-moment'], ['spearman', 'Spearman rank-order'], ['partial', 'Partial']] },
      { k: 'use', type: 'choice', label: 'Missing data', choices: [['complete', 'Complete observations'], ['pairwise', 'Pairwise-complete observations']] }],
    code(v, c) {
      if (v.type === 'partial') return `RcmdrMisc::partial.cor(${c.cols(v.xs)}, use = ${rs(v.use === 'complete' ? 'complete.obs' : 'pairwise.complete.obs')})`;
      return `RcmdrMisc::rcorr.adjust(${c.cols(v.xs)}, type = ${rs(v.type)}, use = ${rs(v.use)})`;
    } },
  correlationTest: {
    fields: [numVar('x', 'First variable'), numVar('y', 'Second variable', { exclude: ['x'] }),
      { k: 'method', type: 'choice', label: 'Correlation coefficient', choices: [['pearson', 'Pearson product-moment'], ['spearman', 'Spearman rank-order'], ['kendall', 'Kendall\'s tau']] },
      alt('Correlation < 0', 'Correlation > 0')],
    code: (v, c) => `cor.test(${c.dv(v.x)}, ${c.dv(v.y)}, alternative = ${rs(v.alt)}, method = ${rs(v.method)})` },
  NormalityTest: { pkgs: ['RcmdrMisc', 'nortest'],
    fields: [numVar('x', 'Variable (pick one)'), groups('g', 'Test by groups (optional)'),
      { k: 'test', type: 'choice', label: 'Normality test', choices: [['shapiro.test', 'Shapiro-Wilk'], ['ad.test', 'Anderson-Darling'], ['cvm.test', 'Cramer-von Mises'], ['lillie.test', 'Lilliefors (Kolmogorov-Smirnov)'], ['pearson.test', 'Pearson chi-square'], ['sf.test', 'Shapiro-Francia']] }],
    code: (v, c) => `RcmdrMisc::normalityTest(${v.g ? `${c.S(v.x)} ~ ${c.S(v.g)}` : `~${c.S(v.x)}`}, test = ${rs(v.test)}, data = ${c.ds})` },
  transformVariables: { pkgs: ['car'],
    fields: [numVars('xs', 'Variables to transform (positive values for Box-Cox)'),
      { k: 'family', type: 'choice', label: 'Transformation family', choices: [['bcPower', 'Box-Cox (positive data)'], ['yjPower', 'Yeo-Johnson (any data)']] }],
    code: (v, c) => lines('local({',
      `  .pt <- car::powerTransform(${v.xs.length > 1 ? `cbind(${v.xs.map(S).join(', ')})` : S(v.xs[0])} ~ 1, data = ${c.ds}, family = ${rs(v.family)})`,
      '  print(summary(.pt))',
      ...v.xs.map((n, i) => `  ${c.ds}$${S((v.family === 'bcPower' ? 'bc.' : 'yj.') + n)} <<- car::${v.family}(${c.dv(n)}, .pt$roundlam[${i + 1}])`), '})') },

  twoWayTable: { pkgs: ['RcmdrMisc', 'abind'],
    fields: [factor('r', 'Row variable'), factor('col', 'Column variable', { exclude: ['r'] }),
      { k: 'pct', type: 'choice', label: 'Compute percentages', choices: [['none', 'None'], ['row', 'Row percentages'], ['col', 'Column percentages'], ['total', 'Percentages of total']] },
      flagsOf('Hypothesis tests', [['chisq', 'Chi-square test of independence', true], ['components', 'Components of chi-square statistic', false], ['expected', 'Print expected frequencies', false], ['fisher', 'Fisher\'s exact test', false]])],
    code: (v, c) => twoWay(`xtabs(~${c.S(v.r)} + ${c.S(v.col)}, data = ${c.ds})`, v) },
  twoWayTableFromCounts: { pkgs: ['RcmdrMisc', 'abind'],
    fields: [factor('r', 'Row variable'), factor('col', 'Column variable', { exclude: ['r'] }), numVar('n', 'Variable holding the counts'),
      { k: 'pct', type: 'choice', label: 'Compute percentages', choices: [['none', 'None'], ['row', 'Row percentages'], ['col', 'Column percentages'], ['total', 'Percentages of total']] },
      flagsOf('Hypothesis tests', [['chisq', 'Chi-square test of independence', true], ['components', 'Components of chi-square statistic', false], ['expected', 'Print expected frequencies', false], ['fisher', 'Fisher\'s exact test', false]])],
    code: (v, c) => twoWay(`xtabs(${c.S(v.n)} ~ ${c.S(v.r)} + ${c.S(v.col)}, data = ${c.ds})`, v) },
  multiWayTable: { pkgs: ['RcmdrMisc', 'abind'],
    fields: [factors('gs', 'Factors (pick three or more; the last ones define the layers)', 3),
      { k: 'pct', type: 'choice', label: 'Compute percentages', choices: [['none', 'None'], ['row', 'Row percentages'], ['col', 'Column percentages'], ['total', 'Percentages of total']] }],
    code: (v, c) => lines('local({', `  .Table <- xtabs(~${v.gs.map(S).join(' + ')}, data = ${c.ds})`, '  print(.Table)',
      v.pct === 'row' && '  print(RcmdrMisc::rowPercents(.Table))', v.pct === 'col' && '  print(RcmdrMisc::colPercents(.Table))',
      v.pct === 'total' && '  print(RcmdrMisc::totPercents(.Table))', '})') },
  enterTable: { ds: false, pkgs: ['RcmdrMisc', 'abind'],
    fields: [{ k: 'table', type: 'text', label: 'Counts, one row per line separated by ";", e.g. 12 5; 7 20', def: '12 5; 7 20',
        pattern: /^\s*[\d.]+([\s,]+[\d.]+)*\s*(;\s*[\d.]+([\s,]+[\d.]+)*\s*)*;?\s*$/, error: 'Use numbers separated by spaces, rows separated by ;' },
      flagsOf('Hypothesis tests', [['chisq', 'Chi-square test of independence', true], ['components', 'Components of chi-square statistic', false], ['expected', 'Print expected frequencies', false], ['fisher', 'Fisher\'s exact test', false]]),
      { k: 'pct', type: 'choice', label: 'Compute percentages', choices: [['none', 'None'], ['row', 'Row percentages'], ['col', 'Column percentages'], ['total', 'Percentages of total']] }],
    async after(v, ui) {
      v.rowsOf = v.table.split(';').map(r => splitList(r)).filter(r => r.length);
      if (new Set(v.rowsOf.map(r => r.length)).size !== 1) {
        await ui.vscode.window.showErrorMessage(ui.t('Every row needs the same number of counts.'));
        return false;
      }
      return true;
    },
    code(v) {
      const nr = v.rowsOf.length, nc = v.rowsOf[0].length;
      const dn = n => rc(Array.from({ length: n }, (_, i) => String(i + 1)));
      const table = `matrix(c(${v.rowsOf.flat().join(', ')}), nrow = ${nr}, ncol = ${nc}, byrow = TRUE, dimnames = list(rows = ${nr > 1 ? dn(nr) : `"1"`}, columns = ${nc > 1 ? dn(nc) : `"1"`}))`;
      return twoWay(table, v);
    } },

  singleSampleTTest: { fields: [numVar('x', 'Variable (pick one)'), alt('Population mean < mu0', 'Population mean > mu0'),
      { k: 'mu', type: 'num', label: 'Null hypothesis: mu =', def: '0.0' }, conf],
    code: (v, c) => `t.test(${c.dv(v.x)}, alternative = ${rs(v.alt)}, mu = ${v.mu}, conf.level = ${v.conf})` },
  independentSamplesTTest: { fields: [twoLevel('g'), numVar('y', 'Response variable (pick one)'), alt(), conf,
      { k: 'eq', type: 'choice', label: 'Assume equal variances?', choices: [['FALSE', 'No (Welch test)'], ['TRUE', 'Yes (pooled variance)']] }],
    code: (v, c) => lines(`tapply(${c.dv(v.y)}, ${c.dv(v.g)}, mean, na.rm = TRUE)`,
      `t.test(${c.S(v.y)} ~ ${c.S(v.g)}, alternative = ${rs(v.alt)}, conf.level = ${v.conf}, var.equal = ${v.eq}, data = ${c.ds})`) },
  pairedTTest: { fields: [numVar('x', 'First variable'), numVar('y', 'Second variable', { exclude: ['x'] }), alt('First < second', 'First > second'), conf],
    code: (v, c) => `t.test(${c.dv(v.x)}, ${c.dv(v.y)}, alternative = ${rs(v.alt)}, conf.level = ${v.conf}, paired = TRUE)` },
  oneWayAnova: { ...model('AnovaModel'),
    fields: [factor('g', 'Groups (pick one)'), numVar('y', 'Response variable (pick one)'), nameField('AnovaModel'),
      flagsOf('Options', [['tukey', 'Pairwise comparisons of means (Tukey)', false], ['welch', 'Welch F-test not assuming equal variances', false]]),
      { k: 'conf', type: 'num', min: 0.0001, max: 0.9999, def: '0.95', label: 'Confidence Level:  ', when: v => v.flags.tukey }],
    code: (v, c) => lines(`${v.name} <- aov(${c.S(v.y)} ~ ${c.S(v.g)}, data = ${c.ds})`, `summary(${v.name})`,
      `tapply(${c.dv(v.y)}, ${c.dv(v.g)}, mean, na.rm = TRUE)`, `tapply(${c.dv(v.y)}, ${c.dv(v.g)}, sd, na.rm = TRUE)`,
      v.flags.welch && `oneway.test(${c.S(v.y)} ~ ${c.S(v.g)}, data = ${c.ds})`, v.flags.tukey && `TukeyHSD(${v.name}, conf.level = ${v.conf})`) },
  multiWayAnova: { ...model('AnovaModel'), pkgs: ['car'],
    fields: [factors('gs', 'Groups (pick two or more)', 2), numVar('y', 'Response variable (pick one)'), nameField('AnovaModel')],
    code: (v, c) => lines(`${v.name} <- lm(${c.S(v.y)} ~ ${v.gs.map(S).join(' * ')}, data = ${c.ds}, contrasts = list(${v.gs.map(g => `${S(g)} = car::contr.Sum`).join(', ')}))`,
      `car::Anova(${v.name})`, `tapply(${c.dv(v.y)}, list(${v.gs.map(g => `${S(g)} = ${c.dv(g)}`).join(', ')}), mean, na.rm = TRUE)`) },
  oneWayRepeatedMeasures: { pkgs: ['car'],
    fields: [numVars('xs', 'Repeated measures (pick two or more, one per level)', 2), { k: 'factor', type: 'name', label: 'Name of the within-subject factor', def: 'Time' },
      { k: 'stat', type: 'choice', label: 'Multivariate Test Statistic', choices: [['Pillai', 'Pillai'], ['Wilks', 'Wilks'], ['Hotelling-Lawley', 'Hotelling-Lawley'], ['Roy', 'Roy']] },
      flagsOf('Tests to Perform', [['multi', 'Multivariate', true], ['uni', 'Univariate', true]]),
      flagsOf('Options', [['means', 'Print means and standard deviations by factors', false], ['plot', 'Plot response means by factors', false]])],
    code: (v, c) => lines('local({', `  .mod <- lm(cbind(${v.xs.map(S).join(', ')}) ~ 1, data = ${c.ds})`,
      `  .idata <- data.frame(${S(v.factor)} = factor(${rc(v.xs)}))`,
      `  print(summary(car::Anova(.mod, idata = .idata, idesign = ~${S(v.factor)}, test.statistic = ${rs(v.stat)}), multivariate = ${rbool(v.flags.multi)}, univariate = ${rbool(v.flags.uni)}))`,
      ...repeatedExtras(v, c), '})') },
  twoWayRepeatedMeasures: { pkgs: ['car'],
    fields: [numVars('xs', 'Repeated measures (pick four or more, factor 1 varying slowest)', 4),
      { k: 'f1', type: 'name', label: 'Name of the first within-subject factor', def: 'A' },
      { k: 'n1', type: 'num', int: true, min: 2, def: '2', label: 'Number of levels of the first factor' },
      { k: 'f2', type: 'name', label: 'Name of the second within-subject factor', def: 'B' },
      { k: 'stat', type: 'choice', label: 'Multivariate Test Statistic', choices: [['Pillai', 'Pillai'], ['Wilks', 'Wilks'], ['Hotelling-Lawley', 'Hotelling-Lawley'], ['Roy', 'Roy']] },
      flagsOf('Tests to Perform', [['multi', 'Multivariate', true], ['uni', 'Univariate', true]]),
      flagsOf('Options', [['means', 'Print means and standard deviations by factors', false], ['plot', 'Plot response means by factors', false]])],
    async after(v, ui) {
      if (v.xs.length % Number(v.n1) !== 0 || v.f1 === v.f2) {
        await ui.vscode.window.showErrorMessage(ui.t('The number of variables must be a multiple of the number of levels, and the factor names must differ.'));
        return false;
      }
      return true;
    },
    code(v, c) {
      const n1 = Number(v.n1), n2 = v.xs.length / n1;
      return lines('local({', `  .mod <- lm(cbind(${v.xs.map(S).join(', ')}) ~ 1, data = ${c.ds})`,
        `  .idata <- data.frame(${S(v.f1)} = factor(rep(paste0(${rs(v.f1)}, 1:${n1}), each = ${n2})), ${S(v.f2)} = factor(rep(paste0(${rs(v.f2)}, 1:${n2}), times = ${n1})))`,
        `  print(summary(car::Anova(.mod, idata = .idata, idesign = ~${S(v.f1)} * ${S(v.f2)}, test.statistic = ${rs(v.stat)}), multivariate = ${rbool(v.flags.multi)}, univariate = ${rbool(v.flags.uni)}))`,
        ...repeatedExtras(v, c), '})');
    } },

  singleProportionTest: { fields: [twoLevel('f', 'Variable (pick one two-level factor)'), alt('Population proportion < p0', 'Population proportion > p0'),
      { k: 'p', type: 'num', min: 0, max: 1, def: '0.5', label: 'Null hypothesis: p =' }, conf,
      { k: 'type', type: 'choice', label: 'Type of test', choices: [['exact', 'Exact binomial test'], ['normal', 'Normal approximation'], ['corrected', 'Normal approximation with continuity correction']] }],
    code: (v, c) => lines('local({', `  .Table <- xtabs(~${c.S(v.f)}, data = ${c.ds})`, '  print(.Table)',
      v.type === 'exact' ? `  print(binom.test(rbind(.Table), alternative = ${rs(v.alt)}, p = ${v.p}, conf.level = ${v.conf}))`
        : `  print(prop.test(rbind(.Table), alternative = ${rs(v.alt)}, p = ${v.p}, conf.level = ${v.conf}, correct = ${rbool(v.type === 'corrected')}))`, '})') },
  twoSampleProportionsTest: { pkgs: ['RcmdrMisc', 'abind'],
    fields: [twoLevel('g', 'Groups (pick one two-level factor)'), twoLevel('r', 'Response variable (pick one two-level factor)', { exclude: ['g'] }), alt(), conf,
      { k: 'type', type: 'choice', label: 'Type of test', choices: [['normal', 'Normal approximation'], ['corrected', 'Normal approximation with continuity correction']] }],
    code: (v, c) => lines('local({', `  .Table <- xtabs(~${c.S(v.g)} + ${c.S(v.r)}, data = ${c.ds})`, '  print(RcmdrMisc::rowPercents(.Table))',
      `  print(prop.test(.Table, alternative = ${rs(v.alt)}, conf.level = ${v.conf}, correct = ${rbool(v.type === 'corrected')}))`, '})') },

  twoVariancesFTest: { fields: [twoLevel('g'), numVar('y', 'Response variable (pick one)'), alt('Ratio of variances < 1', 'Ratio of variances > 1'), conf],
    code: (v, c) => lines(`tapply(${c.dv(v.y)}, ${c.dv(v.g)}, var, na.rm = TRUE)`, `var.test(${c.S(v.y)} ~ ${c.S(v.g)}, alternative = ${rs(v.alt)}, conf.level = ${v.conf}, data = ${c.ds})`) },
  BartlettTest: { fields: [factor('g', 'Groups (pick one)'), numVar('y', 'Response variable (pick one)')],
    code: (v, c) => `bartlett.test(${c.S(v.y)} ~ ${c.S(v.g)}, data = ${c.ds})` },
  LeveneTest: { pkgs: ['car'], fields: [factor('g', 'Groups (pick one)'), numVar('y', 'Response variable (pick one)'),
      { k: 'center', type: 'choice', label: 'Center', choices: [['median', 'Median (Brown-Forsythe)'], ['mean', 'Mean (original Levene)']] }],
    code: (v, c) => `car::leveneTest(${c.dv(v.y)}, ${c.dv(v.g)}, center = ${v.center})` },

  twoSampleWilcoxonTest: { fields: [twoLevel('g'), numVar('y', 'Response variable (pick one)'), alt(),
      { k: 'type', type: 'choice', label: 'Type of test', choices: [['asym', 'Normal approximation'], ['asymNoCor', 'Normal approximation without continuity correction'], ['exact', 'Exact']] }],
    code: (v, c) => lines(`tapply(${c.dv(v.y)}, ${c.dv(v.g)}, median, na.rm = TRUE)`,
      `wilcox.test(${c.S(v.y)} ~ ${c.S(v.g)}, alternative = ${rs(v.alt)}, exact = ${rbool(v.type === 'exact')}, correct = ${rbool(v.type === 'asym')}, data = ${c.ds})`) },
  onesampleWilcoxonTest: { fields: [numVar('x', 'Variable (pick one)'), alt('Population median < m0', 'Population median > m0'),
      { k: 'mu', type: 'num', label: 'Null hypothesis: median =', def: '0.0' },
      { k: 'type', type: 'choice', label: 'Type of test', choices: [['asym', 'Normal approximation'], ['asymNoCor', 'Normal approximation without continuity correction'], ['exact', 'Exact']] }],
    code: (v, c) => `wilcox.test(${c.dv(v.x)}, alternative = ${rs(v.alt)}, mu = ${v.mu}, exact = ${rbool(v.type === 'exact')}, correct = ${rbool(v.type === 'asym')})` },
  pairedWilcoxonTest: { fields: [numVar('x', 'First variable'), numVar('y', 'Second variable', { exclude: ['x'] }), alt('First < second', 'First > second'),
      { k: 'type', type: 'choice', label: 'Type of test', choices: [['asym', 'Normal approximation'], ['asymNoCor', 'Normal approximation without continuity correction'], ['exact', 'Exact']] }],
    code: (v, c) => `wilcox.test(${c.dv(v.x)}, ${c.dv(v.y)}, alternative = ${rs(v.alt)}, paired = TRUE, exact = ${rbool(v.type === 'exact')}, correct = ${rbool(v.type === 'asym')})` },
  KruskalWallisTest: { fields: [factor('g', 'Groups (pick one)'), numVar('y', 'Response variable (pick one)')],
    code: (v, c) => lines(`tapply(${c.dv(v.y)}, ${c.dv(v.g)}, median, na.rm = TRUE)`, `kruskal.test(${c.S(v.y)} ~ ${c.S(v.g)}, data = ${c.ds})`) },
  FriedmanTest: { fields: [numVars('xs', 'Repeated-measures variables (pick three or more)', 3)],
    code: (v, c) => `friedman.test(as.matrix(${c.cols(v.xs)}))` },

  Reliability: { pkgs: ['RcmdrMisc'], fields: [numVars('xs', 'Variables (pick three or more)', 3)],
    code: (v, c) => `RcmdrMisc::reliability(cov(${c.cols(v.xs)}, use = "complete.obs"))` },
  principalComponents: { fields: [numVars('xs', 'Variables (pick two or more)', 2),
      flagsOf('Options', [['cor', 'Analyze correlation matrix', true], ['scree', 'Screeplot', false]]),
      { k: 'add', type: 'num', int: true, min: 0, def: '0', label: 'Components to add to the data set (0 for none)' }],
    code: (v, c) => lines('local({', `  .PC <- princomp(~${v.xs.map(S).join(' + ')}, cor = ${rbool(v.flags.cor)}, data = ${c.ds})`,
      '  cat("\\nComponent loadings:\\n")', '  print(unclass(loadings(.PC)))', '  cat("\\nComponent variances:\\n")', '  print(.PC$sd^2)', '  cat("\\n")', '  print(summary(.PC))',
      v.flags.scree && '  screeplot(.PC)',
      ...Array.from({ length: Number(v.add) }, (_, i) => `  ${c.ds}$PC${i + 1} <<- .PC$scores[, ${i + 1}]`), '})') },
  factorAnalysis: { fields: [numVars('xs', 'Variables (pick three or more)', 3),
      { k: 'k', type: 'num', int: true, min: 1, def: '1', label: 'Number of factors' },
      { k: 'rot', type: 'choice', label: 'Factor rotation', choices: [['varimax', 'Varimax'], ['promax', 'Promax'], ['none', 'None']] },
      { k: 'scores', type: 'choice', label: 'Factor scores', choices: [['none', 'None'], ['regression', 'Regression'], ['Bartlett', 'Bartlett']] }],
    code: (v, c) => lines('local({', `  .FA <- factanal(~${v.xs.map(S).join(' + ')}, factors = ${v.k}, rotation = ${rs(v.rot)}, scores = ${rs(v.scores)}, data = ${c.ds})`, '  print(.FA)',
      v.scores !== 'none' && `  ${c.ds}[rownames(.FA$scores), paste0("F", 1:${v.k})] <<- .FA$scores`, '})') },
  kmeansClustering: { pkgs: ['RcmdrMisc'], assignsVar: 'KMeans',
    fields: [numVars('xs', 'Variables (pick one or more)'), { k: 'k', type: 'num', int: true, min: 2, def: '2', label: 'Number of clusters' },
      { k: 'iters', type: 'num', int: true, min: 1, def: '10', label: 'Maximum iterations:' },
      { k: 'starts', type: 'num', int: true, min: 1, def: '10', label: 'Number of starting seeds' },
      flagsOf('Options', [['scale', 'Standardize the variables', false], ['assign', 'Add the cluster to the data set (variable KMeans)', false], ['plot', 'Plot the clusters (biplot)', true]])],
    code(v, c) {
      const mm = `model.matrix(~-1 + ${v.xs.map(S).join(' + ')}, ${c.ds})`;
      const data = v.flags.scale ? `scale(${mm})` : mm;
      return lines('local({', `  .x <- ${data}`, `  .cluster <- RcmdrMisc::KMeans(.x, centers = ${v.k}, iter.max = ${v.iters}, num.seeds = ${v.starts})`,
        '  print(.cluster$size)', '  print(.cluster$centers)', '  print(.cluster$withinss)', '  print(.cluster$tot.withinss)', '  print(.cluster$betweenss)',
        v.flags.plot && '  biplot(princomp(.x), xlabs = .cluster$cluster)',
        v.flags.assign && `  ${c.ds}$KMeans <<- RcmdrMisc::assignCluster(.x, ${c.ds}, .cluster$cluster)`, '})');
    } },
  hierarchicalCluster: { activeHclust: true,
    fields: [numVars('xs', 'Variables (pick one or more)'), newName('name', 'HClust', 'Name for the solution'),
      { k: 'method', type: 'choice', label: 'Clustering method', choices: ['ward.D', 'ward.D2', 'single', 'complete', 'average', 'mcquitty', 'median', 'centroid'].map(m => [m, m]), def: 3 },
      { k: 'dist', type: 'choice', label: 'Distance measure', choices: ['euclidean', 'maximum', 'manhattan', 'canberra', 'binary', 'minkowski'].map(m => [m, m]) },
      flagsOf('Options', [['plot', 'Plot the dendrogram', true]])],
    code: (v, c) => lines(`${v.name} <- hclust(dist(model.matrix(~-1 + ${v.xs.map(S).join(' + ')}, ${c.ds}), method = ${rs(v.dist)}), method = ${rs(v.method)})`,
      v.flags.plot && `plot(${v.name}, main = ${rs('Cluster Dendrogram for Solution ' + v.name)}, xlab = ${rs('Observation Number in Data Set ' + c.ds)}, sub = ${rs(`Method=${v.method}; Distance=${v.dist}`)})`) },
  hclustSummary: { ds: false,
    fields: [{ k: 'h', type: 'hclust', label: 'Hierarchical clustering solution' }, { k: 'k', type: 'num', int: true, min: 2, def: '3', label: 'Number of clusters' },
      flagsOf('Options', [['print', 'Print cluster summary', true], ['plot', 'Plot the dendrogram with the clusters outlined', true]])],
    code: v => lines(v.flags.print && `print(table(cutree(${S(v.h)}, k = ${v.k})))`, v.flags.plot && `plot(${S(v.h)})\nrect.hclust(${S(v.h)}, k = ${v.k})`) },
  appendHclustGroup: { fields: [{ k: 'h', type: 'hclust', label: 'Hierarchical clustering solution' }, { k: 'k', type: 'num', int: true, min: 2, def: '3', label: 'Number of clusters' },
      { k: 'name', type: 'name', label: 'Name for the cluster variable', def: 'hclus.label' }],
    code: (v, c) => `${c.ds}$${S(v.name)} <- factor(cutree(${S(v.h)}, k = ${v.k})[rownames(${c.ds})])` },

  linearRegressionModel: { ...model('RegModel'),
    fields: [anyVar('xs', 'Explanatory variables (pick one or more)', { multi: true }), numVar('y', 'Response variable (pick one)', { exclude: ['xs'] }), subsetField, weightsField, nameField('RegModel')],
    code: (v, c) => lines(`${v.name} <- lm(${formulaOf(v.y, c.rhs(v.xs), c)}, data = ${c.ds}${subsetArg(v)}${weightsArg(v)})`, `summary(${v.name})`) },
  linearModel: { ...model('LinearModel'),
    fields: [anyVar('xs', 'Explanatory variables (pick one or more)', { multi: true }), numVar('y', 'Response variable (pick one)', { exclude: ['xs'] }),
      { k: 'rhs', type: 'text', label: 'Right-hand side of the model formula (edit to add interactions, e.g. a * b)', def: (c, v) => c.rhs(v.xs) },
      subsetField, weightsField, nameField('LinearModel')],
    code: (v, c) => lines(`${v.name} <- lm(${formulaOf(v.y, v.rhs.trim(), c)}, data = ${c.ds}${subsetArg(v)}${weightsArg(v)})`, `summary(${v.name})`) },
  generalizedLinearModel: { ...model('GLM'),
    fields: [anyVar('xs', 'Explanatory variables (pick one or more)', { multi: true }), anyVar('y', 'Response variable (pick one)', { exclude: ['xs'] }),
      { k: 'family', type: 'choice', label: 'Family', choices: ['binomial', 'poisson', 'gaussian', 'Gamma', 'inverse.gaussian', 'quasibinomial', 'quasipoisson'].map(f => [f, f]) },
      { k: 'link', type: 'choice', label: 'Link function', choices: v => LINKS[v.family].map(l => [l, l]) }, subsetField, weightsField, nameField('GLM')],
    code: (v, c) => lines(`${v.name} <- glm(${formulaOf(v.y, c.rhs(v.xs), c)}, family = ${v.family}(${rs(v.link)}), data = ${c.ds}${subsetArg(v)}${weightsArg(v)})`, `summary(${v.name})`) },
  multinomialLogitModel: { ...model('MultinomialModel'), pkgs: ['nnet'],
    fields: [anyVar('xs', 'Explanatory variables (pick one or more)', { multi: true }), factor('y', 'Response variable (factor)', { exclude: ['xs'] }), subsetField, nameField('MultinomialModel')],
    code: (v, c) => lines(`${v.name} <- nnet::multinom(${formulaOf(v.y, c.rhs(v.xs), c)}, data = ${c.ds}${subsetArg(v)}, trace = FALSE)`, `summary(${v.name})`) },
  ordinalRegressionModel: { ...model('OrdinalModel'), pkgs: ['MASS'],
    fields: [anyVar('xs', 'Explanatory variables (pick one or more)', { multi: true }), factor('y', 'Response variable (ordered factor)', { exclude: ['xs'] }),
      { k: 'method', type: 'choice', label: 'Link function', choices: [['logistic', 'Logit'], ['probit', 'Probit'], ['cloglog', 'Complementary log-log'], ['cauchit', 'Cauchit']] }, subsetField, nameField('OrdinalModel')],
    code: (v, c) => lines(`${v.name} <- MASS::polr(${formulaOf(v.y, c.rhs(v.xs), c)}, data = ${c.ds}${subsetArg(v)}, method = ${rs(v.method)}, Hess = TRUE)`, `summary(${v.name})`) },
  linearMixedModel: { ...model('LMM'), pkgs: ['lme4'],
    fields: [anyVar('xs', 'Fixed-effect variables (pick one or more)', { multi: true }), numVar('y', 'Response variable (pick one)', { exclude: ['xs'] }),
      { k: 'random', type: 'text', label: 'Random effects, e.g. (1 | group) or (x | group)', def: '(1 | )' },
      { k: 'reml', type: 'choice', label: 'Estimation Criterion', choices: [['TRUE', 'REML'], ['FALSE', 'ML']] }, subsetField, weightsField, nameField('LMM')],
    code: (v, c) => lines(`${v.name} <- lme4::lmer(${formulaOf(v.y, `${c.rhs(v.xs)} + ${v.random.trim()}`, c)}, data = ${c.ds}, REML = ${v.reml}${subsetArg(v)}${weightsArg(v)})`, `summary(${v.name})`) },
  generalizedLinearMixedModel: { ...model('GLMM'), pkgs: ['lme4'],
    fields: [anyVar('xs', 'Fixed-effect variables (pick one or more)', { multi: true }), anyVar('y', 'Response variable (pick one)', { exclude: ['xs'] }),
      { k: 'random', type: 'text', label: 'Random effects, e.g. (1 | group)', def: '(1 | )' },
      { k: 'family', type: 'choice', label: 'Family', choices: ['binomial', 'poisson', 'Gamma', 'gaussian'].map(f => [f, f]) },
      { k: 'link', type: 'choice', label: 'Link function', choices: v => LINKS[v.family].map(l => [l, l]) }, subsetField, weightsField, nameField('GLMM')],
    code: (v, c) => lines(`${v.name} <- lme4::glmer(${formulaOf(v.y, `${c.rhs(v.xs)} + ${v.random.trim()}`, c)}, family = ${v.family}(${rs(v.link)}), data = ${c.ds}${subsetArg(v)}${weightsArg(v)})`, `summary(${v.name})`) }
};

const LINKS = {
  binomial: ['logit', 'probit', 'cloglog', 'cauchit', 'log'], poisson: ['log', 'identity', 'sqrt'],
  gaussian: ['identity', 'log', 'inverse'], Gamma: ['inverse', 'identity', 'log'],
  "inverse.gaussian": ['1/mu^2', 'inverse', 'identity', 'log'], quasibinomial: ['logit', 'probit', 'cloglog', 'cauchit', 'log'],
  quasipoisson: ['log', 'identity', 'sqrt']
};

function twoWay(table, v) {
  const pct = { row: 'RcmdrMisc::rowPercents', col: 'RcmdrMisc::colPercents', total: 'RcmdrMisc::totPercents' }[v.pct];
  const f = v.flags;
  return lines('local({', `  .Table <- ${table}`, '  cat("\\nFrequency table:\\n")', '  print(.Table)',
    pct && `  cat("\\n${{ row: 'Row', col: 'Column', total: 'Total' }[v.pct]} percentages:\\n")\n  print(${pct}(.Table))`,
    (f.chisq || f.components || f.expected) && `  .Test <- chisq.test(.Table, correct = FALSE)`,
    f.chisq && '  print(.Test)', f.components && '  cat("\\nChi-square components:\\n")\n  print(round(.Test$residuals^2, 2))',
    f.expected && '  cat("\\nExpected counts:\\n")\n  print(round(.Test$expected, 2))', f.fisher && '  print(fisher.test(.Table))', '})');
}

module.exports = tests;

// The Models menu, dialog by dialog as in Rcmdr: same fields, labels, defaults and generated code.
// Several dialogs change with the class of the active model; the hidden field `cls` holds it for `when`.
const lines = (...parts) => parts.flat().filter(x => x !== false && x !== undefined && x !== null && x !== '').join('\n');
const on = spec => ({ needsModel: true, ds: false, ...spec });
const simple = code => on({ code: (v, c) => code(c.model, c) });
const cls = { k: 'cls', type: 'hidden', def: c => c.modelClass || '' };
const isLm = v => v.cls === 'lm';
const isGlm = v => v.cls === 'glm';
const check = (k, text, on = false, extra = {}) => ({ k, type: 'flags', label: '', items: [[k, text, on]], ...extra });
const choice = (k, label, choices, def, extra = {}) => ({ k, type: 'choice', label, choices, ...(def !== undefined && { def }), ...extra });
const note = (k, text) => ({ k, type: 'note', heading: true, label: text });
const SANDWICH = [['HC0', 'HC0'], ['HC1', 'HC1'], ['HC2', 'HC2'], ['HC3', 'HC3'], ['HC4', 'HC4'], ['HAC', 'HAC']];
const sandwichFields = text => [check('sandwich', text, false, { when: isLm }),
  choice('sandwichType', 'Sandwich estimator', SANDWICH, 'HC3', { when: v => isLm(v) && v.sandwich.sandwich })];
const vcovArg = (v, m) => (isLm(v) && v.sandwich?.sandwich ? (v.sandwichType === 'HAC' ? `, vcov=vcovHAC(${m})` : `, vcov=hccm(${m}, type="${v.sandwichType.toLowerCase()}")`) : '');
const identify = (withNot = true) => choice('identify', 'Identify Points', [['auto', 'Automatically'], ['mouse', 'Interactively with mouse'], ...(withNot ? [['not', 'Do not identify']] : [])]);
// Mouse identification needs a window that takes clicks: R's own X11 window (the VS Code plot viewer cannot).
const withWindow = (v, code) => (v.identify === 'mouse' ? `x11(type="cairo")\n${code}` : code);
const idn = { k: 'idn', type: 'num', int: true, min: 0, def: '2', label: 'Number of points to identify  ' };
// The family of a GLM, read from R (Rcmdr chooses its tests with it).
const familyOf = async (ui, m) => (await ui.query(`if (inherits(${m}, "glm")) ${m}$family$family else ""`))?.[0] || '';
// "y ~ x1 + x2", as Rcmdr writes the active model's formula into lmtest calls.
const formulaOf = async (ui, m) => (await ui.query(`local({ f <- as.character(formula(${m})); paste(f[2], "~", f[3]) })`))?.[0];

const effectFields = (allLabel, expr) => [cls,
  choice('all', allLabel, [['TRUE', 'Yes'], ['FALSE', 'No']]),
  { k: 'predictors', type: 'rlist', label: 'Predictors (pick one or more)', expr: c => expr.replace(/\{m\}/g, c.model), when: v => v.all === 'FALSE' },
  check('partial', 'Plot partial residuals', false, { when: v => !['multinom', 'polr'].includes(v.cls) }),
  choice('style', 'Style of Graph', [['stacked', 'Stacked areas'], ['lines', 'Lines with confidence bands']], undefined, { when: v => ['multinom', 'polr'].includes(v.cls) }),
  { k: 'span', type: 'num', int: true, min: 5, max: 100, def: '50', label: 'Span for smooth', when: v => v.partial?.partial }];
const effectArgs = v => ['multinom', 'polr'].includes(v.cls) ? [`, axes=list(y=list(style="${v.style}"))`, '']
  : v.partial.partial ? [`, partial.residuals=list(span=${Number(v.span) / 100})`, ', residuals=TRUE'] : ['', ''];

// Fields shared by Rcmdr's two 3D model plots (rgl windows): scales, grid, ellipsoid, background, identification, rotations.
const AUTO = '<auto>';
const plot3dOptions = (identifyDefault, extra = []) => [
  { k: 'show', type: 'flags', label: '', items: [['scales', 'Show axis scales', true], ['grid', 'Show surface grid lines', true], ['ellipsoid', 'Plot 50% concentration ellipsoid', false]] },
  ...extra,
  choice('bg', 'Background Color', [['black', 'Black'], ['white', 'White']], 'white'),
  choice('identify', 'Identify Points', [['auto', 'Automatically'], ['mouse', 'Interactively with mouse'], ['not', 'Do not identify']], identifyDefault),
  { k: 'mouseNote', type: 'note', label: 'Drag the right mouse button to identify points,\nclick the right button to exit.', when: v => v.identify === 'mouse' },
  { ...idn, when: v => v.identify === 'auto' },
  { k: 'rotations', type: 'num', int: true, min: 0, max: 10, def: '0', label: 'Number of automatic rotations  ' }];
const plot3dArgs = (v, notIdentified, afterEllipsoid = '') => {
  const id = v.identify === 'auto' ? `, id=list(method='mahal', n =${v.idn})` : v.identify === 'mouse' ? ", id=list(method='identify')" : notIdentified;
  return `, bg="${v.bg}", axis.scales=${v.show.scales ? 'TRUE' : 'FALSE'}, grid=${v.show.grid ? 'TRUE' : 'FALSE'}, ellipsoid=${v.show.ellipsoid ? 'TRUE' : 'FALSE'}${afterEllipsoid}`
    + `${id}${v.rotations !== '0' ? `, revolutions = ${v.rotations}` : ''}`;
};

module.exports = {
  selectActiveModel: { ds: false, select: 'model' },
  // Only linear models have a dialog (the sandwich estimator); the others print their summary straight away.
  summarizeModel: on({ noForm: c => c.modelClass !== 'lm',
    fields: [cls, ...sandwichFields('Use sandwich estimator of    \ncoefficient standard errors')],
    code: (v, c) => (c.modelClass !== 'lm' ? `summary(${c.model}, cor=FALSE)`
      : v.sandwich.sandwich ? `summarySandwich(${c.model}, type="${v.sandwichType.toLowerCase()}")` : `summary(${c.model})`) }),
  compareCoefficients: { ds: false,
    fields: [{ k: 'ms', type: 'models', label: 'Select models (pick two or more)' }],
    code: v => `compareCoefs(${v.ms.join(', ')})` },
  addObservationStatistics: on({ ds: true,
    fields: [{ k: 'stats', type: 'flags', label: '', items: [['fitted', 'Fitted values', true], ['residuals', 'Residuals', true], ['rstudent', 'Studentized residuals', true],
      ['hatvalues', 'Hat-values', true], ['cooks.distance', 'Cook\'s distances', true], ['obsNumbers', 'Observation indices', true]] }],
    code(v, c) {
      const adds = ['fitted', 'residuals', 'rstudent', 'hatvalues', 'cooks.distance'].filter(k => v.stats[k]).map(k => `\n  ${k}.${c.model} <- ${k}(${c.model})`);
      return `${c.ds}<- within(${c.ds}, {${adds.join('')}${v.stats.obsNumbers ? `\n  obsNumber <- 1:nrow(${c.ds})` : ''} \n})`;
    } }),
  aic: simple(m => `AIC(${m})`),
  bic: simple(m => `BIC(${m})`),
  stepwiseRegression: on({
    fields: [choice('direction', 'Direction', [['backward/forward', 'backward/forward'], ['forward/backward', 'forward/backward'], ['backward', 'backward'], ['forward', 'forward']]),
      choice('criterion', 'Criterion', [['BIC', 'BIC'], ['AIC', 'AIC']])],
    code: (v, c) => `stepwise(${c.model}, direction='${v.direction}', criterion='${v.criterion}')` }),
  subsetRegression: on({ ds: true,
    fields: [choice('criterion', 'Criterion for Model Plot', [['bic', 'BIC'], ['Cp', 'Mallows Cp'], ['adjr2', 'Adjusted R-sq.'], ['r2', 'R-squared']]),
      { k: 'nbest', type: 'num', int: true, min: 1, max: 10, def: '1', label: 'Number of best models\nof each size:' },
      { k: 'nvmax', type: 'text', optional: true, def: '', label: 'Maximum size:', pattern: /^\s*\d*\s*$/, error: 'Enter a whole number.', compact: true }],
    // Rcmdr's "Maximum size" starts at the number of predictors (at most 25).
    async after(v, ui) {
      v.formula = (await ui.query(`paste(sub("^[ ]*", "", deparse(formula(${ui.ctx.model}))), collapse = "")`))?.[0];
      if (!v.nvmax.trim()) v.nvmax = (await ui.query(`min(25, ncol(model.matrix(${ui.ctx.model})) - 1)`))?.[0] || '1';
      return Boolean(v.formula);
    },
    code: (v, c) => lines('library(leaps)', `plot(regsubsets(${v.formula}, data=${c.ds}, nbest=${v.nbest}, nvmax=${v.nvmax.trim()}), scale='${v.criterion}')`) }),
  confidenceIntervals: on({
    fields: [cls, note('n', 'Confidence Intervals for Individual Coefficients'),
      { k: 'level', type: 'num', min: 0.0001, max: 0.9999, def: '0.95', label: 'Confidence Level: ' },
      choice('statistic', 'Test Based On', [['LR', 'Likelihood-ratio statistic'], ['Wald', 'Wald statistic']], undefined, { when: isGlm })],
    async after(v, ui) {
      v.link = (await ui.query(`local({ m <- ${ui.ctx.model}; l <- if (isS4(m)) m@resp$family$link else m$family$link; if (is.null(l)) "" else l })`))?.[0] || '';
      return true;
    },
    code: (v, c) => lines(isGlm(v) ? `Confint(${c.model}, level=${v.level}, type="${v.statistic}")` : `Confint(${c.model}, level=${v.level})`,
      ['logit', 'log'].includes(v.link) && `Confint(${c.model}, level=${v.level}, type="${v.statistic || 'LR'}", exponentiate=TRUE)`) }),
  Bootstrap: on({
    fields: [cls, note('n', 'Bootstrap Confidence Intervals for Coefficients'),
      { k: 'level', type: 'num', min: 0.0001, max: 0.9999, def: '0.95', label: 'Confidence level:' },
      { k: 'samples', type: 'num', int: true, min: 1, def: '999', label: 'Number of bootstrap samples:' },
      choice('type', 'Type of Confidence Intervals', [['bca', 'BCa (adjusted percentile)'], ['norm', 'Normal theory'], ['basic', 'Basic bootstrap'], ['perc', 'Percentile']]),
      choice('method', 'Resampling Method', [['case', 'Case resampling'], ['residual', 'Residual resampling']], undefined, { when: isLm }),
      check('plot', 'Plot bootstrap samples', true)],
    code(v, c) {
      const boot = isLm(v) ? `Boot(${c.model}, R=${v.samples}, method="${v.method}")` : `Boot(${c.model}, R=${v.samples})`;
      if (!v.plot.plot) return `confint(${boot},  level=${v.level}, type="${v.type}")`;
      return lines(`.bs.samples <- ${boot}\nplotBoot(.bs.samples)`, `confint(.bs.samples, level=${v.level}, type="${v.type}")`, 'remove(.bs.samples)');
    } }),
  // The table of parameters and their names (b0, b1, ...) is shown as a list.
  DeltaMethodConfInt: on({
    fields: [note('n', 'Confidence Interval by the Delta Method'),
      { k: 'pars', type: 'rlist', min: 0, label: '', prompt: 'Parameter', labelColumn: 2,
        expr: c => `local({ p <- names(coef(${c.model})); paste0(if (p[1] == "(Intercept)") paste0("b", seq_along(p) - 1) else paste0("b", seq_along(p)), "\\t", p) })` },
      { k: 'level', type: 'num', min: 0.0001, max: 0.9999, def: '0.95', label: 'Confidence level:' },
      { k: 'expression', type: 'text', label: 'Expression to evaluate; use parameter names:', def: '', sample: 'b1/b2' }],
    code: (v, c) => `DeltaMethod(${c.model}, "${v.expression.trim()}", level=${v.level})` }),
  anovaTable: on({
    fields: [cls, choice('type', 'Type of Tests', [['I', 'Sequential ("Type I")'], ['II', 'Partial obeying marginality ("Type II")'], ['III', 'Partial ignoring marginality ("Type III")']], 'II'),
      ...sandwichFields('Use sandwich estimator of\ncoefficient covariance matrix   ')],
    check: v => (v.type === 'I' && isLm(v) && v.sandwich?.sandwich ? 'sandwich covariance matrix unavailable with type I tests' : undefined),
    async after(v, ui) { v.family = await familyOf(ui, ui.ctx.model); return true; },
    code(v, c) {
      const binpois = ['binomial', 'poisson'].includes(v.family);
      if (v.type === 'I') return isGlm(v) ? `anova(${c.model}, test="${binpois ? 'Chisq' : 'F'}")` : `anova(${c.model})`;
      if (isGlm(v)) return `Anova(${c.model}, type="${v.type}", test="${binpois ? 'LR' : 'F'}")`;
      return `Anova(${c.model}, type="${v.type}"${vcovArg(v, c.model)})`;
    } }),
  compareModels: { ds: false,
    fields: [{ k: 'm1', type: 'model', label: 'First model (pick one)' }, { k: 'm2', type: 'model', label: 'Second model (pick one)' }],
    check: v => (v.m1 === v.m2 ? 'You can\'t compare a model to itself.' : undefined),
    async after(v, ui) {
      v.family = await familyOf(ui, v.m1);
      if (v.family && v.family !== await familyOf(ui, v.m2)) { await ui.vscode.window.showWarningMessage(ui.t('Models do not have the same family.')); return false; }
      return true;
    },
    code: v => (v.family ? `anova(${v.m1}, ${v.m2}, test="${['binomial', 'poisson'].includes(v.family) ? 'Chisq' : 'F'}")` : `anova(${v.m1}, ${v.m2})`) },
  testLinearHypothesis: on({
    fields: [cls, { k: 'nrows', type: 'num', int: true, min: 1, max: 20, def: '1', label: 'Number of Rows:' },
      { k: 'matrix', type: 'table', rowsOf: 'nrows', colsExpr: c => `names(coef(${c.model}))`, rhsLabel: 'Right-hand side', cellDefault: '0',
        label: 'Enter hypothesis matrix and right-hand side vector:' },
      ...sandwichFields('Use sandwich estimator of\ncoefficient covariance matrix   ')],
    check: v => (v.matrix.cells.some(r => r.every(x => Number(x) === 0)) ? 'Hypothesis matrix contains a row of 0s' : undefined),
    async after(v, ui) { v.family = await familyOf(ui, ui.ctx.model); return true; },
    code(v, c) {
      const { cells, rhs } = v.matrix;
      const test = isGlm(v) ? (['binomial', 'poisson'].includes(v.family) ? ', test="Chisq"' : ', test="F"') : '';
      return `local({\n  .Hypothesis <- matrix(c(${cells.flat().join(',')}), ${cells.length}, ${cells[0].length}, byrow=TRUE)\n  .RHS <- c(${rhs.join(',')})` +
        `\n  linearHypothesis(${c.model}, .Hypothesis, rhs=.RHS${vcovArg(v, c.model)}${test})\n})`;
    } }),
  VIF: simple(m => `vif(${m})`),
  BreuschPaganTest: on({ ds: true,
    fields: [note('n', 'Score Test for Nonconstant Error Variance'), check('student', 'Studentized test statistic'),
      choice('var', 'Variance Formula', [['fitted', 'Fitted values'], ['predictors', 'Explanatory variables'], ['other', 'Other (specify)']]),
      { k: 'formula', type: 'formula', label: '', prompt: 'Variance Formula', hasLhs: false, when: v => v.var === 'other' }],
    async after(v, ui) { v.modelFormula = await formulaOf(ui, ui.ctx.model); return Boolean(v.modelFormula); },
    code(v, c) {
      const type = v.var === 'fitted' ? `, varformula = ~ fitted.values(${c.model})` : v.var === 'predictors' ? '' : `, varformula = ~${v.formula.rhs}`;
      return 'library(lmtest)\n' + `bptest(${v.modelFormula}${type}, studentize=${v.student.student ? 'TRUE' : 'FALSE'}, data=${c.ds})`;
    } }),
  DurbinWatsonTest: on({ ds: true,
    fields: [note('n', 'Test for First-Order Error Autocorrelation'),
      choice('alt', 'Alternative Hypothesis', [['greater', 'rho >  0'], ['two.sided', 'rho != 0'], ['less', 'rho <  0']])],
    async after(v, ui) { v.modelFormula = await formulaOf(ui, ui.ctx.model); return Boolean(v.modelFormula); },
    code: (v, c) => 'library(lmtest)\n' + `dwtest(${v.modelFormula}, alternative="${v.alt}", data=${c.ds})` }),
  RESETtest: on({ ds: true,
    fields: [note('n', 'Test for Nonlinearity'),
      { k: 'powers', type: 'flags', label: 'Powers to Include', items: [['square', '2 (squares)', true], ['cube', '3 (cubes)   ', true]] },
      choice('type', 'Type of Test', [['regressor', 'Explanatory variables'], ['fitted', 'Fitted values'], ['princomp', 'First principal component']])],
    check: v => (!v.powers.square && !v.powers.cube ? 'No powers are checked.' : undefined),
    async after(v, ui) { v.modelFormula = await formulaOf(ui, ui.ctx.model); return Boolean(v.modelFormula); },
    code: (v, c) => 'library(lmtest)\n' + `resettest(${v.modelFormula}, power=${v.powers.square && v.powers.cube ? '2:3' : v.powers.square ? '2' : '3'}, type="${v.type}", data=${c.ds})` }),
  OutlierTest: simple(m => `outlierTest(${m})`),
  transformResponse: on({
    fields: [choice('family', 'Transformation Family', [['bcPower', 'Box-Cox'], ['bcnPower', 'Box-Cox with negatives'], ['yjPower', 'Yeo-Johnson']])],
    code: (v, c) => `summary(powerTransform(${c.model}, family="${v.family}"))` }),
  plotModel: simple(m => lines('oldpar <- par(oma=c(0,0,3,0), mfrow=c(2,2))', `plot(${m})`, 'par(oldpar)')),
  residualQQPlot: on({
    fields: [check('simulate', 'Simulated confidence envelope', true), identify(), idn],
    code: (v, c) => withWindow(v, `qqPlot(${c.model}, simulate=${v.simulate.simulate ? 'TRUE' : 'FALSE'}, id=list(${v.identify === 'mouse' ? 'method="identify"' : `method="y", n=${v.identify === 'not' ? 0 : v.idn}`}))`) }),
  CRPlots: on({ fields: [{ k: 'span', type: 'num', int: true, min: 5, max: 100, def: '50', label: 'Span for smooth' }],
    code: (v, c) => `crPlots(${c.model}, smooth=list(span=${Number(v.span) / 100}))` }),
  AVPlots: on({ fields: [identify(), idn],
    code: (v, c) => withWindow(v, `avPlots(${c.model}, id=list(${v.identify === 'mouse' ? 'method="identify"' : `method="mahal", n=${v.identify === 'not' ? 0 : v.idn}`}))`) }),
  CRPlot3D: on({ ds: true, pkgs: ['rgl', 'mgcv'],
    fields: [{ k: 'x', type: 'rlist', label: 'Explanatory variables (pick two)', min: 2, max: 2, selectN: 2,
      expr: c => `intersect(names(Filter(is.numeric, ${c.ds})), all.vars(formula(${c.model})[[3]]))` },
      ...plot3dOptions('not', [{ k: 'dfNonpar', type: 'text', label: 'Smooth regression   df = ', def: AUTO, compact: true }])],
    check: v => (v.x.length !== 2 ? 'You must select 2 explanatory variables.' : undefined),
    code: (v, c) => `library(rgl)\ncrPlot3d(${c.model}, "${v.x[0]}", "${v.x[1]}"${plot3dArgs(v, '', `, df.mgcv = ${v.dfNonpar.trim() === AUTO ? 'NULL' : Number(v.dfNonpar)}`)})` }),
  AVPlot3D: on({ ds: true, pkgs: ['rgl'],
    fields: [{ k: 'x', type: 'rlist', label: 'Coefficients (pick two)', min: 2, max: 2, selectN: 2, expr: c => `setdiff(names(coef(${c.model})), "(Intercept)")` },
      ...plot3dOptions('auto', [{ k: 'surfaces', type: 'flags', label: 'Surfaces to Fit', items: [['linear', 'Linear least-squares', true], ['robust', 'Robust linear regression', false]] }])],
    check: v => (v.x.length !== 2 ? 'You must select 2 coefficients.' : undefined),
    code(v, c) {
      const fits = ['linear', 'robust'].filter(s => v.surfaces[s]).map(s => `"${s}"`);
      const fit = !fits.length ? ', surface=FALSE' : fits.length === 1 ? `, fit=${fits[0]}` : `, fit=c(${fits.join(',')})`;
      return `library(rgl)\navPlot3d(${c.model}, "${v.x[0]}", "${v.x[1]}"${plot3dArgs(v, ', id=FALSE')}${fit})`;
    } }),
  InfluencePlot: on({ fields: [identify(false), idn],
    code: (v, c) => withWindow(v, `influencePlot(${c.model}, id=list(${v.identify === 'mouse' ? 'method="identify"' : `method="noteworthy", n=${v.idn}`}))`) }),
  InfluenceIndexPlot: on({
    fields: [identify(false), idn,
      { k: 'vars', type: 'flags', label: 'Case statistics to plot', items: [['Cook', 'Cook\'s distances', true], ['Studentized', 'Studentized residuals', true], ['Bonf', 'Bonferroni p-values', true], ['hat', 'Hat-values', true]] }],
    check: v => (!Object.values(v.vars).some(Boolean) ? 'No statistics selected.' : undefined),
    code: (v, c) => withWindow(v, `influenceIndexPlot(${c.model}, id=list(${v.identify === 'mouse' ? 'method="identify"' : `method="y", n=${v.idn}`}), vars=c(${Object.keys(v.vars).filter(k => v.vars[k]).map(k => `"${k}"`).join(', ')}))`) }),
  effectPlots: on({
    fields: effectFields('Plot All High-Order Effects?', 'all.vars(formula({m})[[3]])'),
    check: v => (v.all === 'FALSE' && !(v.predictors || []).length ? 'No predictors selected.' : undefined),
    code(v, c) {
      const [after, inner] = effectArgs(v);
      return v.all === 'TRUE' ? `plot(allEffects(${c.model}${inner})${after})`
        : `plot(Effect(c(${v.predictors.map(p => `"${p}"`).join(', ')}), ${c.model}${inner})${after})`;
    } }),
  predictorEffectPlots: on({
    fields: effectFields('Plot all predictor effects?', 'all.vars(formula({m})[[3]])'),
    check: v => (v.all === 'FALSE' && !(v.predictors || []).length ? 'No predictors selected.' : undefined),
    code(v, c) {
      const [after, inner] = effectArgs(v);
      return v.all === 'TRUE' ? `plot(predictorEffects(${c.model}${inner})${after})`
        : `plot(predictorEffects(${c.model}, c(${v.predictors.map(p => `"${p}"`).join(', ')})${inner})${after})`;
    } })
};

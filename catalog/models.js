const { rs, rc, rbool, S, splitList } = require('../lib/rhelpers');
const { conf } = require('./common');

const lines = (...parts) => parts.flat().filter(Boolean).join('\n');
const flagsOf = (label, items) => ({ k: 'flags', type: 'flags', label, items });
// Commands that act on the active model; `c.model` is its name.
const on = (spec) => ({ needsModel: true, ds: false, ...spec });
const simple = (code, pkgs) => on({ pkgs, code: (v, c) => code(c.model, c) });
const sandwich = { k: 'flags', type: 'flags', label: 'Sandwich estimator', items: [['hc', 'Use sandwich estimator of coefficient standard errors', false]] };
const vcov = (m, v) => (v.flags.hc ? `, vcov. = sandwich::vcovHC(${m}, type = "HC3")` : '');
const idField = { k: 'idn', type: 'num', int: true, min: 0, def: '2', label: 'Number of points to identify' };

// Fields shared by the two effect-plot dialogs: all effects or a chosen subset.
const effectFields = (expr, allLabel) => [
  { k: 'flags', type: 'flags', label: 'Options', items: [['all', allLabel, true], ['resid', 'Plot partial residuals', false]] },
  { k: 'terms', type: 'rlist', label: 'Predictors (pick one or more)', expr: c => expr.replace('{m}', c.model), when: v => !v.flags.all },
  { k: 'style', type: 'choice', label: 'Style of Graph', choices: [['panels', 'Separate panels'], ['multiline', 'All lines in one panel']] },
  { k: 'span', type: 'num', min: 0.05, max: 1, def: '0.5', label: 'Span for smooth', when: v => v.flags.resid }
];

module.exports = {
  selectActiveModel: { ds: false, select: 'model' },
  summarizeModel: on({ pkgs: ['lmtest', 'sandwich'], fields: [sandwich],
    code: (v, c) => lines(`summary(${c.model})`, v.flags.hc && `lmtest::coeftest(${c.model}, vcov. = sandwich::vcovHC(${c.model}, type = "HC3"))`) }),
  compareCoefficients: { ds: false, pkgs: ['car'],
    fields: [{ k: 'ms', type: 'models', label: 'Models to compare (pick two or more)' }],
    code: v => `car::compareCoefs(${v.ms.map(S).join(', ')})` },
  addObservationStatistics: on({ ds: true,
    fields: [flagsOf('Statistics to add to the data set', [['fitted', 'Fitted values', true], ['residuals', 'Residuals', true], ['rstudent', 'Studentized residuals', true],
      ['hatvalues', 'Hat-values', true], ['cooks.distance', 'Cook\'s distances', true], ['obs', 'Observation indices', false]])],
    code: (v, c) => Object.keys(v.flags).filter(k => v.flags[k]).map(k => k === 'obs'
      ? `${c.ds}$obsNumber <- 1:nrow(${c.ds})`
      : `${c.ds}$${S(`${{ fitted: 'fitted', residuals: 'residuals', rstudent: 'rstudent', hatvalues: 'hatvalues', 'cooks.distance': 'cooks.distance' }[k]}.${c.model}`)} <- ${k === 'fitted' ? 'fitted.values' : k}(${c.model})`).join('\n') }),
  aic: simple(m => `AIC(${m})`),
  bic: simple(m => `BIC(${m})`),
  stepwiseRegression: on({ pkgs: ['RcmdrMisc'],
    fields: [{ k: 'dir', type: 'choice', label: 'Direction', choices: [['backward/forward', 'Backward/forward'], ['forward/backward', 'Forward/backward'], ['backward', 'Backward'], ['forward', 'Forward']] },
      { k: 'crit', type: 'choice', label: 'Criterion', choices: [['BIC', 'BIC'], ['AIC', 'AIC']] }],
    code: (v, c) => `RcmdrMisc::stepwise(${c.model}, direction = ${rs(v.dir)}, criterion = ${rs(v.crit)})` }),
  subsetRegression: on({ pkgs: ['leaps'],
    fields: [{ k: 'scale', type: 'choice', label: 'Criterion to display', choices: [['bic', 'BIC'], ['Cp', 'Mallows Cp'], ['adjr2', 'Adjusted R-squared'], ['r2', 'R-squared']] },
      { k: 'nbest', type: 'num', int: true, min: 1, def: '1', label: 'Number of best models for each size' }],
    code: (v, c) => lines('local({', `  .sub <- leaps::regsubsets(formula(${c.model}), data = model.frame(${c.model}), nbest = ${v.nbest})`, '  print(summary(.sub))', `  plot(.sub, scale = ${rs(v.scale)})`, '})') }),
  confidenceIntervals: on({ fields: [{ k: 'test', type: 'choice', label: 'Test Based On', choices: [['lr', 'Likelihood-ratio statistic'], ['wald', 'Wald statistic']] }, conf],
    code: (v, c) => `${v.test === 'wald' ? 'confint.default' : 'confint'}(${c.model}, level = ${v.conf})` }),
  Bootstrap: on({ pkgs: ['car', 'boot'],
    fields: [{ k: 'R', type: 'num', int: true, min: 10, def: '999', label: 'Number of bootstrap replications' },
      { k: 'method', type: 'choice', label: 'Method', choices: [['case', 'Case resampling'], ['residual', 'Residual resampling']] },
      { k: 'type', type: 'choice', label: 'Type of interval', choices: [['bca', 'Bias-corrected, accelerated'], ['perc', 'Percentile'], ['norm', 'Normal'], ['basic', 'Basic']] }, conf],
    code: (v, c) => lines('library(car)', 'local({', `  .boot <- car::Boot(${c.model}, R = ${v.R}, method = ${rs(v.method)})`, '  print(summary(.boot))', `  print(confint(.boot, level = ${v.conf}, type = ${rs(v.type)}))`, '})') }),
  DeltaMethodConfInt: on({ pkgs: ['car'],
    fields: [{ k: 'expr', type: 'text', label: 'Expression in the coefficient names (see the model summary), e.g. b1 / b2', def: '' }, conf],
    async after(v, ui) {
      const names = await ui.query(`names(coef(${ui.ctx.model}))`);
      if (names) {
        const text = await ui.text({ label: ui.t('Expression using these coefficient names: {0}', names.join(', ')), def: v.expr,
          validate: s => s.trim() ? undefined : ui.t('A value is required.') });
        if (text === undefined) return false;
        v.expr = text; v.names = names;
      }
      return true;
    },
    code: (v, c) => `car::deltaMethod(${c.model}, ${rs(v.expr)}${v.names ? `, parameterNames = ${rc(v.names.map(n => n.replace(/[^A-Za-z0-9_.]/g, '.')))}` : ''}, level = ${v.conf})` }),
  anovaTable: on({ pkgs: ['car', 'sandwich'], fields: [{ k: 'type', type: 'choice', label: 'Type of tests', choices: [['II', 'Sequential-free, marginal (type II)'], ['III', 'Each term adjusted for all others (type III)']] }, sandwich],
    code: (v, c) => `car::Anova(${c.model}, type = ${rs(v.type)}${vcov(c.model, v)})` }),
  compareModels: { ds: false,
    fields: [{ k: 'm1', type: 'model', label: 'First model' }, { k: 'm2', type: 'model', label: 'Second model' }],
    code: v => `anova(${S(v.m1)}, ${S(v.m2)})` },
  testLinearHypothesis: on({ pkgs: ['car', 'sandwich'],
    fields: [{ k: 'hyp', type: 'text', label: 'Hypotheses separated by ";", e.g. x1 = 0; x2 = x3', def: '', sample: 'n2 = 0' }, sandwich],
    async after(v, ui) {
      const names = await ui.query(`names(coef(${ui.ctx.model}))`);
      const text = await ui.text({ label: ui.t('Hypotheses separated by ";" using the coefficient names: {0}', (names || []).join(', ')), def: v.hyp,
        validate: s => s.trim() ? undefined : ui.t('A value is required.') });
      if (text === undefined) return false;
      v.hyp = text;
      return true;
    },
    code: (v, c) => `car::linearHypothesis(${c.model}, c(${v.hyp.split(';').map(s => s.trim()).filter(Boolean).map(rs).join(', ')})${vcov(c.model, v)})` }),
  VIF: simple(m => `car::vif(${m})`, ['car']),
  BreuschPaganTest: on({ ds: true, pkgs: ['lmtest'],
    fields: [{ k: 'var', type: 'choice', label: 'Variance depends on', choices: [['fitted', 'Fitted values'], ['expl', 'Explanatory variables'], ['custom', 'A formula']] },
      { k: 'f', type: 'text', label: 'Right-hand side of the variance formula', def: '', when: v => v.var === 'custom' },
      flagsOf('Options', [['student', 'Studentized test statistic', true]])],
    code: (v, c) => `lmtest::bptest(${c.model}, ${v.var === 'fitted' ? `varformula = ~fitted.values(${c.model}), ` : v.var === 'custom' ? `varformula = ~${v.f.trim()}, ` : ''}studentize = ${rbool(v.flags.student)}, data = ${c.ds})` }),
  DurbinWatsonTest: on({ pkgs: ['lmtest'],
    fields: [{ k: 'alt', type: 'choice', label: 'Alternative hypothesis', choices: [['greater', 'Positive serial correlation'], ['less', 'Negative serial correlation'], ['two.sided', 'Two-sided']] }],
    code: (v, c) => `lmtest::dwtest(${c.model}, alternative = ${rs(v.alt)})` }),
  RESETtest: on({ pkgs: ['lmtest'],
    fields: [{ k: 'type', type: 'choice', label: 'Powers of', choices: [['regressor', 'Each regressor'], ['fitted', 'Fitted values'], ['princomp', 'First principal component']] },
      { k: 'power', type: 'numlist', label: 'Powers to include', def: '2, 3' }],
    code: (v, c) => `lmtest::resettest(${c.model}, power = c(${v.power.join(', ')}), type = ${rs(v.type)})` }),
  OutlierTest: simple(m => `car::outlierTest(${m})`, ['car']),
  transformResponse: on({ pkgs: ['car'], fields: [{ k: 'family', type: 'choice', label: 'Transformation Family', choices: [['bcPower', 'Box-Cox'], ['yjPower', 'Yeo-Johnson']] }],
    code: (v, c) => `summary(car::powerTransform(${c.model}, family = ${rs(v.family)}))` }),
  plotModel: simple(m => lines('local({', '  .old <- par(oma = c(0, 0, 3, 0), mfrow = c(2, 2))', `  plot(${m})`, '  par(.old)', '})')),
  residualQQPlot: on({ pkgs: ['car'], fields: [{ k: 'flags', type: 'flags', label: 'Options', items: [['sim', 'Simulated confidence envelope', false]] }, idField],
    code: (v, c) => `car::qqPlot(${c.model}, id = list(method = "y", n = ${v.idn})${v.flags.sim ? ', simulate = TRUE' : ''})` }),
  CRPlots: on({ pkgs: ['car'], fields: [{ k: 'span', type: 'num', min: 0.05, max: 1, def: '0.5', label: 'Span for smooth' }],
    code: (v, c) => `car::crPlots(${c.model}, smooth = list(span = ${v.span}))` }),
  AVPlots: on({ pkgs: ['car'], fields: [idField], code: (v, c) => `car::avPlots(${c.model}, id = list(n = ${v.idn}, method = "mahal"))` }),
  InfluencePlot: on({ pkgs: ['car'], fields: [idField], code: (v, c) => `car::influencePlot(${c.model}, id = list(n = ${v.idn}, method = "noteworthy"))` }),
  InfluenceIndexPlot: on({ pkgs: ['car'],
    fields: [{ k: 'flags', type: 'flags', label: 'Case statistics to plot', items: [['Cook', 'Cook\'s distances', true], ['studentized', 'Studentized residuals', true], ['Bonf', 'Bonferroni p-values for outliers', true], ['hat', 'Hat-values', true]] }, idField],
    code: (v, c) => `car::influenceIndexPlot(${c.model}, vars = ${rc(Object.keys(v.flags).filter(k => v.flags[k]))}, id = list(n = ${v.idn}))` }),
  effectPlots: on({ pkgs: ['effects'], fields: effectFields('names(effects::allEffects({m}))', 'Plot All High-Order Effects?'),
    code: (v, c) => `plot(effects::allEffects(${c.model}${v.flags.resid ? ', residuals = TRUE' : ''})${v.flags.all ? '' : `[${rc(v.terms)}]`}, ask = FALSE${v.style === 'multiline' ? ', multiline = TRUE' : ''}${v.flags.resid ? `, span = ${v.span}` : ''})` }),
  predictorEffectPlots: on({ pkgs: ['effects'], fields: effectFields('all.vars(formula({m}))[-1]', 'Plot all predictor effects?'),
    code: (v, c) => `plot(effects::predictorEffects(${c.model}${v.flags.all ? '' : `, predictors = ${rc(v.terms)}`}${v.flags.resid ? ', residuals = TRUE' : ''}), ask = FALSE${v.style === 'multiline' ? ', multiline = TRUE' : ''}${v.flags.resid ? `, span = ${v.span}` : ''})` })
};

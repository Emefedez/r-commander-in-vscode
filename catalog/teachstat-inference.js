// "Statistical Inference" menu of the RcmdrPlugin.TeachStat plug-in: confidence intervals and hypothesis tests.
// The code is what its dialogs generate: a call to the plug-in's test functions (MKV.test, VUM.test, VKM.test,
// DMKV.test, Cprop.test...) followed by cat() lines that print the report. The texts of those lines are written in
// the current language when the code is generated, as the plug-in does with gettext, so t() is used for each.
const { rs, S } = require('../lib/rhelpers');
const { t } = require('../lib/i18n');
const { numVar, factor, groups } = require('./common');

const lines = (...parts) => parts.flat().filter(Boolean).join('\n');
const fixedAlt = [['two.sided', 'Two-sided'], ['less', 'Left-sided'], ['greater', 'Right-sided']];

// ---- fields shared by many dialogs ----------------------------------------------------------------------------
const intervalType = { k: 'type', type: 'choice', label: 'Interval type', choices: fixedAlt };
const confidence = { k: 'conf', type: 'num', min: 0, max: 1, def: '0.95', label: 'Confidence level:' };
const alternative = { k: 'alt', type: 'choice', label: 'Alternative hypothesis', choices: fixedAlt };
const knownValue = (k, label, when, extra = {}) => ({ k, type: 'num', label, def: '1', when, ...extra });

// Level pickers need the factor first: the levels come from R once a factor is chosen.
const groupLevels = (factorKey, ds) => ({
  g1: { k: 'level1', type: 'rlist', of: factorKey, single: true, selectFirst: true, label: 'Group 1', exprFor: (g, c) => `levels(as.factor(${c.ds}$${S(g)}))` },
  g2: { k: 'level2', type: 'rlist', of: factorKey, single: true, label: 'Group 2', exprFor: (g, c) => `levels(as.factor(${c.ds}$${S(g)}))` }
});
const pickedLevel = value => [].concat(value || [])[0];

// ---- report pieces ---------------------------------------------------------------------------------------------
const dashes = title => '- '.repeat(Math.floor((title.length + 4) / 2));
const typeText = type => t(fixedAlt.find(([k]) => k === type)[1]);

function intervalReport({ command, title, variableLine, extraLines = [], estimate = 'one' }) {
  const heading = `\\n${title}\\n`;
  const estimateLine = estimate === 'two'
    ? `cat("${t('Sample estimates')}:",names(aux$estimate)[1],as.numeric(aux$estimate)[1],",", names(aux$estimate)[2],as.numeric(aux$estimate)[2],"\\n")`
    : `cat("${t('Sample estimate')}:",names(aux$estimate),as.numeric(aux$estimate),"\\n")`;
  return (v, extra) => lines('local({', ...command, 'aux2<-as.vector(aux[["conf.int"]]) ', `cat("${heading}")`, `cat("${dashes(title)}\\n")`,
    `cat("${t('Interval type')}: ${typeText(v.type)}\\n")`, `cat("${t('Confidence level')}: ${Number(v.conf) * 100}%\\n")`, ...variableLine, ...extraLines, estimateLine,
    `cat("${t('Interval')}: (",aux2[1],",",aux2[2],")\\n")`, '})');
}

const pValue = () => ['if(aux$p.value>0.05){cat("' + t('p-value') + ':",format.pval(aux$p.value),"\\n")}',
  '    if(aux$p.value>=0.025 && aux$p.value<=0.05){cat("' + t('p-value') + ':",format.pval(aux$p.value),"*\\n")}',
  '    if(aux$p.value>=0.0001 && aux$p.value<=0.025){cat("' + t('p-value') + ':",format.pval(aux$p.value),"**\\n")}',
  '    if(aux$p.value>=0 && aux$p.value<=0.0001){cat("' + t('p-value') + ':",format.pval(aux$p.value),"***\\n")}'];

// The distribution line differs between tests: the z statistic is N(0,1), the others carry their degrees of freedom.
const distributions = {
  zOrDf: () => lines('if(names(aux$statistic)=="z"){', `cat("${t('Distribution')}:","N(0,1)\\n")`, '} else {',
    `cat("${t('Distribution')}:",names(aux$statistic),"${t('with')}",as.numeric(aux$parameter),"${t('degrees of freedom')}\\n")`, '}'),
  zOrDfIndependent: () => lines(`if(names(aux$statistic)=="z"){cat("${t('Distribution')}:","Normal(0,1)\\n")}`,
    `                      else {cat("${t('Distribution')}:",names(aux$statistic),"${t('with')}",as.numeric(aux$parameter),"${t('degrees of freedom')}\\n")}`),
  df: () => `cat("${t('Distribution')}:",names(aux$statistic),"${t('with')}",as.numeric(aux$parameter),"${t('degrees of freedom')}\\n")`,
  df1: () => `cat("${t('Distribution')}:",names(aux$statistic),"${t('with')}",as.numeric(aux$parameter[1]),"${t('degrees of freedom')}\\n")`,
  df2: () => `cat("${t('Distribution')}:",names(aux$statistic),"${t('with')}",as.numeric(aux$parameter[1]),"${t('and')}", as.numeric(aux$parameter[2]),"${t('degrees of freedom')}\\n")`,
  normal: () => `cat("${t('Distribution')}:","Normal(0,1)\\n")`
};

function testReport({ command, title, variableLine, distribution, hAlt, estimate = 'one' }) {
  const heading = `\\n${title}\\n`;
  const underline = dashes(title);
  const estimateLine = estimate === 'two'
    ? `cat("${t('Sample estimates')}:",names(aux$estimate)[1],as.numeric(aux$estimate)[1],",", names(aux$estimate)[2],as.numeric(aux$estimate)[2],"\\n")`
    : `cat("${t('Sample estimate')}:",names(aux$estimate),as.numeric(aux$estimate),"\\n")`;
  return v => lines('local({', ...command(v), `cat("${heading}${underline}\\n${variableLine(v)}")`, distribution(v),
    `cat("${t('Test statistics value')}:",as.numeric(aux$statistic),"\\n")`, ...pValue(), `cat("${t('Alternative hypothesis')}:","${hAlt(v)}","\\n")`, estimateLine, '})');
}

const altText = (v, less, greater, notEqual) => (v.alt === 'less' ? less : v.alt === 'greater' ? greater : notEqual);
const altQuoted = v => rs(v.alt);

// ---- confidence intervals -------------------------------------------------------------------------------------------
const knownVariance = { k: 'variance', type: 'choice', label: 'Variance', choices: [['unknown', 'Unknown'], ['known', 'Known']] };
const unknownKnownMean = { k: 'mean', type: 'choice', label: 'Mean', choices: [['unknown', 'Unknown'], ['known', 'Known']] };
const variancesChoice = { k: 'variances', type: 'choice', label: 'Variances', def: 2, choices: [['known', 'Known'], ['equal', 'Unknown and equal'], ['unequal', 'Unknown and unequal']] };
const sigma = (k, label, when) => knownValue(k, label, when, { positive: true, def: '1' });

const ci = {
  intervaloConfianzaMedia: { fields: [numVar('x', 'Variable (pick one)'), knownVariance, sigma('s2', 'Known variance value', v => v.variance === 'known'), intervalType, confidence],
    code: (v, c) => {
      const x = `${c.ds}$${S(v.x)}`;
      const known = v.variance === 'known';
      return intervalReport({
        command: [known ? `aux<-MKV.test(${x}, sd=${Math.sqrt(Number(v.s2))}, conf.level=${v.conf}, alternative='${v.type}')` : `aux<-t.test(${x}, conf.level=${v.conf}, alternative='${v.type}')`],
        title: known ? `${t('Confidence Interval for the mean with known variance =')} ${Number(v.s2)}` : t('Confidence Interval for the mean with unknown variance'),
        variableLine: [`cat("${t('Variable')}: ${v.x}\\n")`] })(v);
    } },
  intervaloConfianzaVarianza: { fields: [numVar('x', 'Variable (pick one)'), unknownKnownMean, knownValue('mu', 'Known mean value', v => v.mean === 'known', { def: '0' }), intervalType, confidence],
    code: (v, c) => {
      const x = `${c.ds}$${S(v.x)}`;
      const known = v.mean === 'known';
      return intervalReport({
        command: [known ? `aux<-VKM.test(${x}, mu=${Number(v.mu)}, conf.level=${v.conf}, alternative='${v.type}')` : `aux<-VUM.test(${x}, conf.level=${v.conf}, alternative='${v.type}')`],
        title: known ? `${t('Confidence Interval for the variance with known mean =')} ${Number(v.mu)}` : t('Confidence Interval for the variance with unknown mean'),
        variableLine: [`cat("${t('Variable')}: ${v.x}\\n")`] })(v);
    } },
  intervaloConfianzaMediasIndependientes: (() => { const lv = groupLevels('g'); return { fields: [numVar('x', 'Variable (pick one)'), factor('g', 'Groups (pick one)'), lv.g1, lv.g2, variancesChoice,
      sigma('s1', 'Variance of group 1', v => v.variances === 'known'), sigma('s2', 'Variance of group 2', v => v.variances === 'known'), intervalType, confidence],
    check: v => (pickedLevel(v.level1) === pickedLevel(v.level2) ? 'Group 1 and Group 2 must not coincide' : undefined),
    code: (v, c) => {
      const [l1, l2] = [pickedLevel(v.level1), pickedLevel(v.level2)];
      const subsets = [`var1<-subset(${c.ds}, ${S(v.g)}=="${l1}", select=${S(v.x)})`, `var2<-subset(${c.ds}, ${S(v.g)}=="${l2}", select=${S(v.x)})`];
      const body = v.variances === 'known'
        ? [`aux<- DMKV.test(var1, var2, sdx=${Math.sqrt(Number(v.s1))}, sdy=${Math.sqrt(Number(v.s2))}, conf.level=${v.conf}, alternative='${v.type}')`]
        : v.variances === 'equal' ? [`aux<- t.test(var1, var2, var.equal = TRUE, conf.level=${v.conf}, alternative='${v.type}')`]
          : [`aux<- t.test(var1, var2, conf.level=${v.conf}, alternative='${v.type}')`];
      const title = v.variances === 'known' ? `${t('Confidence Interval for the mean difference of two independent samples with known variances')} (Sigma^2_1= ${Number(v.s1)}, Sigma^2_2= ${Number(v.s2)})`
        : v.variances === 'equal' ? t('Confidence Interval for the mean difference of two independent samples with unknown and equal variances')
          : t('Confidence Interval for the mean difference of two independent samples with unknown and unequal variances');
      return intervalReport({ command: [...subsets, ...body], title, estimate: 'two',
        variableLine: [`cat("${t('Variable')}: ${v.x}\\n")`, `cat("${t('Groups')}: ${v.g} [${l1} vs. ${l2}]\\n")`] })(v);
    } }; })(),
  intervaloConfianzaMediasPareadas: { fields: [numVar('x', 'First variable (pick one)'), numVar('y', 'Second variable (pick one)', { exclude: ['x'] }), intervalType, confidence],
    code: (v, c) => intervalReport({ command: [`aux<-t.test(${c.ds}$${S(v.x)}, ${c.ds}$${S(v.y)}, paired = TRUE, conf.level=${v.conf}, alternative='${v.type}')`],
      title: t('Confidence Interval for the mean difference of two paired samples'), variableLine: [`cat("${t('Variable')}: ${v.x} vs. ${v.y}\\n")`] })(v) },
  intervaloConfianza2Varianzas: (() => { const lv = groupLevels('g'); return { fields: [numVar('x', 'Variable (pick one)'), factor('g', 'Groups (pick one)'), lv.g1, lv.g2, intervalType, confidence],
    check: v => (pickedLevel(v.level1) === pickedLevel(v.level2) ? 'Group 1 and Group 2 must not coincide' : undefined),
    code: (v, c) => {
      const [l1, l2] = [pickedLevel(v.level1), pickedLevel(v.level2)];
      return intervalReport({ command: [`var1<-subset(${c.ds},${S(v.g)}=="${l1}", select=${S(v.x)})`, `var2<-subset(${c.ds},${S(v.g)}=="${l2}", select=${S(v.x)})`,
        `aux<- var.test(var1[,1], var2[,1], conf.level=${v.conf}, alternative='${v.type}')`], title: `${t('Confidence Interval for the ratio of two variances')} `,
      variableLine: [`cat("${t('Variable')}: ${v.x}\\n")`, `cat("${t('Groups')}: ${v.g} [${l1} vs. ${l2}]\\n")`] })(v);
    } }; })()
};

// ---- proportions ---------------------------------------------------------------------------------------------------
// Either a variable and the level that counts as a success, or the counts typed in.
const countField = (k, label) => ({ k, type: 'text', optional: true, def: '', label, pattern: /^\s*\d*\s*$/, error: 'Enter a whole number.', sample: '12', sampleOnlyB: true });
const proportionSource = (variableLabel = 'Variable (pick one)') => [
  { k: 'x', type: 'var', kind: 'factor', optional: true, label: variableLabel },
  { k: 'level', type: 'rlist', of: 'x', single: true, selectFirst: true, label: 'Proportion for the level (pick one)', exprFor: (x, c) => `levels(as.factor(${c.ds}$${S(x)}))` },
  countField('succ', 'No. successes'), countField('fail', 'No. failures')];
const proportionCheck = v => {
  const typed = v.succ.trim() !== '' || v.fail.trim() !== '';
  if (!v.x && !typed) return 'A variable or successes number and failures number must be selected';
  if (typed && (v.succ.trim() === '' || v.fail.trim() === '')) return 'Successes number and failures number must be provided';
  if (typed && (Number(v.succ) === 0 || Number(v.fail) === 0)) return 'There must be at least 1 success and 1 failure';
  return undefined;
};
const levelsLines = (varName, quotedLevel, many) => [`levelsaux<-levels(${varName})`, `levelsaux<-levelsaux[levelsaux!=${quotedLevel}]`];

ci.intervaloConfianzaProporcion = { fields: [...proportionSource(), intervalType, confidence],
  check: proportionCheck,
  code: (v, c) => {
    const heading = t('Confidence Interval for a proportion');
    if (v.x && !(v.succ.trim() || v.fail.trim())) {
      const x = `${c.ds}$${S(v.x)}`, level = rs(pickedLevel(v.level));
      const other = '", levelsaux,"';
      return intervalReport({ command: [`exitos<-sum(${x} == ${level},na.rm = TRUE)`, `total<-length(${x})`, `aux<- Cprop.test(ex=exitos, nx=total, conf.level=${v.conf}, alternative='${v.type}')`, ...levelsLines(x, level)],
        title: heading, variableLine: [`cat("${t('Variable')}: ${v.x} [${pickedLevel(v.level)} vs.", levelsaux,"] --> ${t('No. successes')} = ",exitos," -- ${t('No. attempts')} =", total,"\\n")`] })(v);
    }
    const s = Number(v.succ), n = s + Number(v.fail);
    return intervalReport({ command: [`aux<- Cprop.test(ex=${s}, nx=${n}, conf.level=${v.conf}, alternative='${v.type}')`], title: heading,
      variableLine: [`cat("${t('Sample')}: ${t('No. successes')} = ${s} -- ${t('No. attempts')} = ${n}\\n")`] })(v);
  } };

ci.intervaloConfianzaDiferenciaProporciones = (() => {
  const lv = groupLevels('g');
  return { fields: [factor('g', 'Groups (pick one)'), lv.g1, lv.g2, { k: 'x', type: 'var', kind: 'factor', optional: true, exclude: ['g'], label: 'Variable' },
    { k: 'success', type: 'rlist', of: 'x', single: true, selectFirst: true, label: 'Success', exprFor: (x, c) => `levels(as.factor(${c.ds}$${S(x)}))` },
    countField('s1', 'No. successes'), countField('f1', 'No. failures'), countField('s2', 'No. successes'), countField('f2', 'No. failures'), intervalType, confidence],
  check: v => {
    const typed = [v.s1, v.f1, v.s2, v.f2].some(x => x.trim() !== '');
    if (!typed) return v.g && v.x && pickedLevel(v.level1) !== pickedLevel(v.level2) ? undefined : 'Group 1, Group 2 and Success must be selected';
    if ([v.s1, v.f1, v.s2, v.f2].some(x => x.trim() === '')) return 'Successes number and failures number must be provided';
    return undefined;
  },
  code: (v, c) => {
    const heading = t('Confidence interval for difference of proportions');
    if (v.g && v.x && ![v.s1, v.f1, v.s2, v.f2].some(x => x.trim())) {
      const g = `${c.ds}$${S(v.g)}`, x = `${c.ds}$${S(v.x)}`, [l1, l2] = [rs(pickedLevel(v.level1)), rs(pickedLevel(v.level2))], ok = rs(pickedLevel(v.success));
      return intervalReport({ estimate: 'two', title: heading,
        command: [`exitos<-sum(${g} == ${l1} & ${x}==${ok},na.rm = TRUE)`, `total<-sum(${g} == ${l1},na.rm = TRUE)`, `exitos2<-sum(${g} == ${l2} & ${x}==${ok},na.rm = TRUE)`, `total2<-sum(${g} == ${l2},na.rm = TRUE)`,
          `aux<- Cprop.test(ex=exitos, nx=total,ey=exitos2,ny=total2, conf.level=${v.conf}, alternative='${v.type}')`, ...levelsLines(x, ok)],
        variableLine: [`cat("${t('Variable')}: ${v.x} [${pickedLevel(v.success)} vs. ", levelsaux, "]\\n")`,
          `cat("${t('Group 1')}: ${v.g} [ ${pickedLevel(v.level1)} ] --> ${t('No. successes')} = ",exitos," -- ${t('No. attempts')} =", total,"\\n")`,
          `cat("${t('Group 2')}: ","${v.g} [ ${pickedLevel(v.level2)} ] --> ${t('No. successes')} = ",exitos2," -- ${t('No. attempts')} =", total2,"\\n")`] })(v);
    }
    const [s1, s2] = [Number(v.s1), Number(v.s2)], [n1, n2] = [s1 + Number(v.f1), s2 + Number(v.f2)];
    return intervalReport({ estimate: 'two', title: heading, command: [`aux<- Cprop.test(ex=${s1}, nx=${n1}, ey=${s2}, ny=${n2}, conf.level=${v.conf}, alternative='${v.type}')`],
      variableLine: [`cat("${t('Sample 1')}: ${t('No. successes')} = ${s1} -- ${t('No. attempts')} = ${n1}\\n")`, `cat("${t('Sample 2')}: ${t('No. successes')} = ${s2} -- ${t('No. attempts')} = ${n2}\\n")`] })(v);
  } };
})();

// ---- hypothesis tests -------------------------------------------------------------------------------------------------
const nullValue = (k, label, def, extra = {}) => ({ k, type: 'num', label, def, ...extra });
const tests = {};

tests.contrasteHipotesisMedia = { fields: [numVar('x', 'Variable (pick one)'), knownVariance, sigma('s2', 'Known variance value', v => v.variance === 'known'), alternative, nullValue('mu0', 'Null hypothesis: mu = ', '0.0'), confidence],
  code: (v, c) => {
    const x = `${c.ds}$${S(v.x)}`, known = v.variance === 'known', mu0 = Number(v.mu0);
    return testReport({ title: known ? `${t('Hypothesis Testing for the mean with known variance =')} ${Number(v.s2)}` : t('Hypothesis Testing for the mean with unknown variance'),
      command: () => [known ? `aux<-MKV.test(${x}, sd=${Math.sqrt(Number(v.s2))}, alternative=${altQuoted(v)}, mu=${mu0}, conf.level=${v.conf})` : `aux<-t.test(${x}, alternative=${altQuoted(v)}, mu=${mu0}, conf.level=${v.conf})`],
      variableLine: () => `${t('Variable')}: ${v.x}\\n`, distribution: distributions.zOrDf,
      hAlt: w => `${altText(w, t('Population mean is less than'), t('Population mean is greater than'), t('Population mean is not equal to'))} ${mu0}` })(v);
  } };

tests.contrasteHipotesisVarianza = { fields: [numVar('x', 'Variable (pick one)'), unknownKnownMean, knownValue('mu', 'Known mean value', v => v.mean === 'known', { def: '0' }), alternative, nullValue('sigma20', 'Null hypothesis: sigma^2 = ', '1', { positive: true }), confidence],
  code: (v, c) => {
    const x = `${c.ds}$${S(v.x)}`, known = v.mean === 'known', s0 = Number(v.sigma20);
    return testReport({ title: known ? `${t('Hypothesis Testing for the variance with known mean =')} ${Number(v.mu)}` : t('Hypothesis Testing for the variance with unknown mean'),
      command: () => [known ? `aux<-VKM.test(${x}, alternative=${altQuoted(v)}, sigma=${Math.sqrt(s0)}, mu=${Number(v.mu)}, conf.level=${v.conf})` : `aux<-VUM.test(${x}, alternative=${altQuoted(v)}, sigma=${Math.sqrt(s0)}, conf.level=${v.conf})`],
      variableLine: () => `${t('Variable')}: ${v.x}\\n`, distribution: distributions.df1,
      hAlt: w => `${altText(w, t('Population variance is less than'), t('Population variance is greater than'), t('Population variance is not equal to'))} ${s0}` })(v);
  } };

tests.contrastHipotesisProporcion = { fields: [...proportionSource(), alternative, nullValue('p0', 'Null hypothesis: p = ', '0.5', { min: 0, max: 1 }), confidence],
  check: v => proportionCheck(v) || (Number(v.p0) <= 0 || Number(v.p0) >= 1 ? 'Value for the null hypothesis must be between 0 and 1 (and not be)' : undefined),
  code: (v, c) => {
    const p0 = Number(v.p0);
    const hAlt = w => `${altText(w, t('Population proportion is less than'), t('Population proportion is greater than'), t('Population proportion is not equal to'))} ${p0}`;
    if (v.x && !(v.succ.trim() || v.fail.trim())) {
      const x = `${c.ds}$${S(v.x)}`, level = rs(pickedLevel(v.level));
      return testReport({ title: t('Hypothesis Testing for a proportion'), estimate: 'one',
        command: () => [`exitos<-sum(${x} == ${level},na.rm = TRUE)`, `total<-length(${x})`, `aux<- Cprop.test(ex=exitos, nx=total, p.null=${p0}, alternative=${altQuoted(v)})`, ...levelsLines(x, level)],
        variableLine: () => `${t('No. successes')}: ${v.x} [${pickedLevel(v.level)} vs.", levelsaux,"] --> ${t('No. successes')} = ",exitos," -- ${t('No. attempts')} =", total,"\\n"`.replace(/"$/, ''),
        distribution: distributions.normal, hAlt })(v);
    }
    const s = Number(v.succ), n = s + Number(v.fail);
    return testReport({ title: t('Hypothesis Testing for a proportion'), command: () => [`aux<- Cprop.test(ex=${s}, nx=${n},p.null=${p0}, alternative=${altQuoted(v)})`],
      variableLine: () => `${t('Sample')}: ${t('No. successes')} = ${s} -- ${t('No. attempts')} = ${n}\\n`, distribution: distributions.normal, hAlt })(v);
  } };

tests.contrasteHipotesisMediasIndependientes = (() => { const lv = groupLevels('g'); return { fields: [numVar('x', 'Variable (pick one)'), factor('g', 'Groups (pick one)'), lv.g1, lv.g2, variancesChoice,
    sigma('s1', 'Variance of group 1', v => v.variances === 'known'), sigma('s2', 'Variance of group 2', v => v.variances === 'known'), alternative, nullValue('mu0', 'Null hypothesis: mu_1 - mu_2 = ', '0.0'), confidence],
  check: v => (pickedLevel(v.level1) === pickedLevel(v.level2) ? 'Group 1 and Group 2 must not coincide' : undefined),
  code: (v, c) => {
    const [l1, l2] = [pickedLevel(v.level1), pickedLevel(v.level2)], mu0 = Number(v.mu0);
    const calls = { known: `aux<-DMKV.test(var1, var2, sdx=${Math.sqrt(Number(v.s1))}, sdy=${Math.sqrt(Number(v.s2))}, difmu=${mu0}, alternative=${altQuoted(v)}, conf.level=${v.conf})`,
      equal: `aux<-t.test(var1, var2, var.equal = TRUE, mu=${mu0}, alternative=${altQuoted(v)}, conf.level=${v.conf})`, unequal: `aux<-t.test(var1, var2, mu=${mu0}, alternative=${altQuoted(v)}, conf.level=${v.conf})` };
    const title = v.variances === 'known' ? `${t('Hypothesis Testing for the mean difference of two independent samples with known variances')} (Sigma^2_1= ${Number(v.s1)}, Sigma^2_2= ${Number(v.s2)})`
      : v.variances === 'equal' ? t('Hypothesis Testing for the mean difference of two independent samples with unknown and equal variances')
        : t('Hypothesis Testing for the mean difference of two independent samples with unknown and unequal variances');
    return testReport({ title, estimate: 'two',
      command: () => [`var1<-subset(${c.ds}, ${S(v.g)}=="${l1}", select=${S(v.x)})`, `var2<-subset(${c.ds}, ${S(v.g)}=="${l2}", select=${S(v.x)})`, calls[v.variances]],
      variableLine: () => `${t('Variable')}: ${v.x}\\n${t('Groups')}: ${v.g} [${l1} vs. ${l2}]\\n`, distribution: distributions.zOrDfIndependent,
      hAlt: w => `${altText(w, t('Population difference is less than'), t('Population difference is greater than'), t('Population difference is not equal to'))} ${mu0}` })(v);
  } }; })();

tests.contrasteHipotesisMediasPareadas = { fields: [numVar('x', 'First variable (pick one)'), numVar('y', 'Second variable (pick one)', { exclude: ['x'] }), alternative, nullValue('mu0', 'Null hypothesis: mu_1 - mu_2 = ', '0.0'), confidence],
  code: (v, c) => {
    const mu0 = Number(v.mu0);
    return testReport({ title: t('Hypothesis Testing for the mean difference of two paired samples'),
      command: () => [`aux<-t.test(${c.ds}$${S(v.x)}, ${c.ds}$${S(v.y)}, mu=${mu0}, alternative=${altQuoted(v)}, paired = TRUE, conf.level=${v.conf})`],
      variableLine: () => `Variables: ${v.x} vs. ${v.y}\\n`, distribution: distributions.df,
      hAlt: w => `${altText(w, t('Population difference is less than'), t('Population difference is greater than'), t('Population difference is not equal to'))} ${mu0}` })(v);
  } };

tests.contrasteHipotesis2Varianzas = (() => { const lv = groupLevels('g'); return { fields: [numVar('x', 'Variable (pick one)'), factor('g', 'Groups (pick one)'), lv.g1, lv.g2, alternative,
    nullValue('r0', 'Null hypothesis: sigma^2_1/sigma^2_2 = ', '1', { positive: true }), confidence],
  check: v => (pickedLevel(v.level1) === pickedLevel(v.level2) ? 'Group 1 and Group 2 must not coincide' : undefined),
  code: (v, c) => {
    const [l1, l2] = [pickedLevel(v.level1), pickedLevel(v.level2)], r0 = Number(v.r0);
    return testReport({ title: `${t('Hypothesis testing for the ratio of two variances')} `,
      command: () => [`var1<-subset(${c.ds},${S(v.g)}=="${l1}", select=${S(v.x)})`, `var2<-subset(${c.ds},${S(v.g)}=="${l2}", select=${S(v.x)})`,
        `aux<-var.test(var1[,1], var2[,1], ratio=${r0}, alternative=${altQuoted(v)}, conf.level=${v.conf})`],
      variableLine: () => `${t('Variable')}: ${v.x}\\n${t('Groups')}: ${v.g} [${l1} vs. ${l2}]\\n`, distribution: distributions.df2,
      hAlt: w => `${altText(w, t('Ratio of population variances is less than '), t('Ratio of population variances is greater than '), t('Ratio of population variances is not equal to '))}${r0}` })(v);
  } }; })();

tests.contrasteHipotesisDiferenciaProporciones = (() => { const lv = groupLevels('g'); return { fields: [factor('g', 'Groups (pick one)'), lv.g1, lv.g2, { k: 'x', type: 'var', kind: 'factor', optional: true, exclude: ['g'], label: 'Variable' },
    { k: 'success', type: 'rlist', of: 'x', single: true, selectFirst: true, label: 'Success', exprFor: (x, c) => `levels(as.factor(${c.ds}$${S(x)}))` },
    countField('s1', 'No. successes'), countField('f1', 'No. failures'), countField('s2', 'No. successes'), countField('f2', 'No. failures'), alternative,
    nullValue('d0', 'Null hypothesis: p_1 - p_2 = ', '0', { min: -1, max: 1 }), confidence],
  check: v => {
    const typed = [v.s1, v.f1, v.s2, v.f2].some(x => x.trim() !== '');
    if (!typed) return v.g && v.x && pickedLevel(v.level1) !== pickedLevel(v.level2) ? undefined : 'Group 1, Group 2 and Success must be selected';
    return [v.s1, v.f1, v.s2, v.f2].some(x => x.trim() === '') ? 'Successes number and failures number must be provided' : undefined;
  },
  code: (v, c) => {
    const d0 = Number(v.d0);
    const hAlt = w => `${altText(w, t('Population difference is less than'), t('Population difference is greater than'), t('Population difference is not equal to'))} ${d0}`;
    if (v.g && v.x && ![v.s1, v.f1, v.s2, v.f2].some(x => x.trim())) {
      const g = `${c.ds}$${S(v.g)}`, x = `${c.ds}$${S(v.x)}`, [l1, l2] = [rs(pickedLevel(v.level1)), rs(pickedLevel(v.level2))], ok = rs(pickedLevel(v.success));
      return testReport({ title: t('Hypothesis testing for difference of proportions'), estimate: 'two',
        command: () => [`exitos<-sum(${g} == ${l1} & ${x}==${ok},na.rm = TRUE)`, `total<-sum(${g} == ${l1},na.rm = TRUE)`, `exitos2<-sum(${g} == ${l2} & ${x}==${ok},na.rm = TRUE)`, `total2<-sum(${g} == ${l2},na.rm = TRUE)`,
          `aux<- Cprop.test(ex=exitos, nx=total,ey=exitos2,ny=total2, p.null=${d0}, alternative=${altQuoted(v)})`],
        variableLine: () => `${t('Variable')}: ${v.x}[ ${pickedLevel(v.success)} vs. ${t('Other levels')} ]\\n${t('Group 1')}: ${v.g} [ ${pickedLevel(v.level1)} ] --> ${t('No. successes')} = ",exitos," -- ${t('No. attempts')} =", total,"\\n${t('Group 2')}: ","${v.g} [ ${pickedLevel(v.level2)} ]--> ${t('No. successes')} = ",exitos2," -- ${t('No. attempts')} =", total2,"\\n`,
        distribution: distributions.normal, hAlt })(v);
    }
    const [s1, s2] = [Number(v.s1), Number(v.s2)], [n1, n2] = [s1 + Number(v.f1), s2 + Number(v.f2)];
    return testReport({ title: t('Hypothesis testing for difference of proportions'), estimate: 'two',
      command: () => [`aux<- Cprop.test(ex=${s1}, nx=${n1}, ey=${s2}, ny=${n2}, p.null=${d0}, alternative=${altQuoted(v)})`],
      variableLine: () => `${t('Sample 1')}: ${t('No. successes')} = ${s1} -- ${t('No. attempts')} = ${n1}\\n${t('Sample 2')}: ${t('No. successes')} = ${s2} -- ${t('No. attempts')} = ${n2}\\n`,
      distribution: distributions.normal, hAlt })(v);
  } }; })();

module.exports = { ...ci, ...tests };

// Commands of the "Basic Statistics" menu that the RcmdrPlugin.TeachStat plug-in adds to R Commander.
// Labels reuse the plug-in's own English strings, so they pick up its Spanish translation, and the code is
// the one its dialogs generate (the functions come from the plug-in, loaded by attach_rcmdr()).
const { rs, rc, rbool, S, splitList } = require('../lib/rhelpers');
const { numVar, numVars, factor, groups } = require('./common');

const flagsOf = (label, items, extra = {}) => ({ k: 'stats', type: 'flags', label, items, ...extra });
const lines = (...parts) => parts.flat().filter(Boolean).join('\n');

const STATS = [['mean', 'Mean', true], ['sd', 'Standard Deviation', true], ['se(mean)', 'Standard Error of Mean', false], ['IQR', 'Interquartile Range', true],
  ['quantiles', 'Quantiles', true], ['cv', 'Coefficient of Variation', false], ['skewness', 'Skewness', false], ['kurtosis', 'Kurtosis', false]];
const statsField = (extra = []) => flagsOf('Statistics', [...STATS.slice(0, 4), ...extra, ...STATS.slice(4)]);
const quantilesField = { k: 'q', type: 'numlist', label: 'Quantiles:', def: '0,0.25,0.5,0.75,1', when: v => v.stats.quantiles };
const typeField = { k: 'type', type: 'choice', label: 'Type of skewness and kurtosis', choices: [['2', '2'], ['1', '1'], ['3', '3']],
  when: v => v.stats.skewness || v.stats.kurtosis };
const chosen = v => STATS.map(s => s[0]).concat('mode').filter(k => v.stats[k]);
const statistics = v => `c(${chosen(v).map(rs).join(', ')})`;
const quantiles = v => (v.stats.quantiles ? (v.q.length === 1 ? v.q[0] : `c(${v.q.join(',')})`) : 'NULL');
const dsCols = (c, vars) => (vars.length === 1 ? `${c.ds}[${rs(vars[0])}]` : `${c.ds}[${rc(vars)}]`);
const groupArg = (c, g) => (g ? `${c.ds}$${S(g)}` : 'NULL');

// Class intervals for the frequency table: a number of breaks, the breaks themselves, an algorithm or a sequence.
const breaksFields = (extraWhen = () => true) => [
  { k: 'how', type: 'choice', label: 'Breaks', choices: [['ncortes', 'Breaks number:'], ['vcortes', 'Breaks vector:'], ['alcortes', 'Breaks algorithm:'], ['seqcortes', 'From:']],
    when: v => v.flags.table && extraWhen(v) },
  { k: 'nbreaks', type: 'num', int: true, min: 2, def: '10', label: 'Breaks number:', when: v => v.flags.table && extraWhen(v) && v.how === 'ncortes' },
  { k: 'vbreaks', type: 'numlist', def: '0,10,20,30', label: 'Breaks vector:', when: v => v.flags.table && extraWhen(v) && v.how === 'vcortes' },
  { k: 'albreaks', type: 'choice', label: 'Breaks algorithm:', choices: [['Sturges', 'Sturges'], ['Scott', 'Scott'], ['FD', 'FD']], when: v => v.flags.table && extraWhen(v) && v.how === 'alcortes' },
  { k: 'from', type: 'num', def: '0', label: 'From:', when: v => v.flags.table && extraWhen(v) && v.how === 'seqcortes' },
  { k: 'to', type: 'num', def: '10', label: 'to:', when: v => v.flags.table && extraWhen(v) && v.how === 'seqcortes' },
  { k: 'by', type: 'num', def: '1', label: 'by:', when: v => v.flags.table && extraWhen(v) && v.how === 'seqcortes' }
];
const breaks = v => {
  if (!v.flags.table) return 'NULL';
  switch (v.how) {
    case 'ncortes': return v.nbreaks;
    case 'vcortes': return `c(${v.vbreaks.join(',')})`;
    case 'alcortes': return rs(v.albreaks);
    default: return `seq(from = ${v.from}, to = ${v.to}, by = ${v.by})`;
  }
};
const tableFlag = [['table', 'Frequency table', false]];

// ---- Random variables: the distribution families of the plug-in (built with the distr package) ----------------
const FAMILIES = [
  { id: 'normal', title: 'Normal', ctor: 'Norm', params: [['mean', 'Mean', '0'], ['sd', 'Standard deviation', '1', { positive: true }]] },
  { id: 't', title: 't', ctor: 'Td', params: [['df', 'Degrees of freedom', '1', { positive: true }]] },
  { id: 'chisq', title: 'ChiSquared', ctor: 'Chisq', params: [['df', 'Degrees of freedom', '1', { positive: true }]] },
  { id: 'F', title: 'F', ctor: 'Fd', params: [['df1', 'Numerator degrees of freedom', '1', { positive: true }], ['df2', 'Denominator degrees of freedom', '1', { positive: true }]] },
  { id: 'exponential', title: 'Exponential', ctor: 'Exp', params: [['rate', 'Rate', '1', { positive: true }]] },
  { id: 'uniform', title: 'Uniform', ctor: 'Unif', params: [['Min', 'Minimum', '0'], ['Max', 'Maximum', '1']],
    check: v => (Number(v.p_Min) >= Number(v.p_Max) ? 'Lower limit must be less than upper limit.' : undefined) },
  { id: 'binomial', title: 'Binomial', ctor: 'Binom', discrete: true, xlab: 'Number of Successes',
    params: [['size', 'Binomial trials', '1', { positive: true, round: true }], ['prob', 'Probability of success', '0.5', { min: 0, max: 1 }]] },
  { id: 'Poisson', title: 'Poisson', ctor: 'Pois', discrete: true, xlab: 'x', params: [['lambda', 'Mean', '1', { min: 0 }]] },
  { id: 'geom', title: 'Geometric', ctor: 'Geom', discrete: true, xlab: 'Number of Failures until Success', params: [['prob', 'Probability of success', '0.5', { min: 0, max: 1 }]] },
  { id: 'negbinomial', title: 'NegativeBinomial', ctor: 'Nbinom', discrete: true, xlab: 'Number of Failures Until Target Successes',
    params: [['size', 'Target number of successes', '0', { min: 0, round: true }], ['prob', 'Probability of success', '0.5', { min: 0, max: 1 }]] }
];
const paramFields = fam => fam.params.map(([k, label, def, o = {}]) => ({ k: `p_${k}`, type: 'num', label, def, ...(o.positive && { positive: true }), ...(o.min !== undefined && { min: o.min }), ...(o.max !== undefined && { max: o.max }) }));
const paramValue = (fam, v, k) => {
  const o = fam.params.find(p => p[0] === k)[3] || {};
  const n = Number(v[`p_${k}`]);
  return String(o.round ? Math.round(n) : n);
};
// The distribution as the plug-in writes it, e.g. Norm(mean=0, sd=1), qualified so distr need not be attached.
const distribution = (fam, v) => `distr::${fam.ctor}(${fam.params.map(([k]) => `${k}=${paramValue(fam, v, k)}`).join(', ')})`;
const mainTitle = (fam, v) => {
  const [a, b] = fam.params;
  const text = fam.id === 'negbinomial' ? `Trials=${paramValue(fam, v, 'size')}, Prob=${paramValue(fam, v, 'prob')}`
    : fam.id === 'F' ? `Numerator df = ${paramValue(fam, v, 'df1')}, Denominator df = ${paramValue(fam, v, 'df2')}`
      : fam.params.map(([k, label]) => `${label}=${paramValue(fam, v, k)}`).join(', ');
  return `${fam.title} Distribution: ${text}`;
};
const colorField = (k, label, def) => ({ k, type: 'text', def, label, pattern: /^\S+$/, error: 'Enter a color name or a hex code.' });
const LEGEND_POSITIONS = ['topright', 'topleft', 'bottomright', 'bottomleft', 'top', 'bottom', 'left', 'right', 'center'].map(p => [p, p]);
const numberList = text => String(text || '').trim().split(/[\s,]+/).filter(Boolean);
const validNumbers = list => list.every(x => /^[-+]?(Inf|\d*\.?\d+([eE][-+]?\d+)?)$/.test(x));
// The shade the plug-in uses for the regions: from the chosen colour towards white.
const shades = (color, n) => `(grDevices::colorRampPalette(c(${rs(color)}, rgb((grDevices::colorRamp(c(${rs(color)}, "white")))(0.8), maxColorValue = 255))))(${n})`;

function distributionCommands(fam) {
  const prefix = fam.id;
  const params = paramFields(fam);
  const famCheck = fam.check;
  const out = {};

  out[`${prefix}DistrQuantiles`] = { ds: false,
    fields: [{ k: 'probs', type: 'numlist', label: 'Probabilities', def: '' }, ...params,
      { k: 'tail', type: 'choice', label: 'Tail', choices: [['lower', 'Lower tail'], ['upper', 'Upper tail']] }],
    check: famCheck,
    code: v => `distr::q(${distribution(fam, v)})(c(${v.probs.join(',')}), lower.tail=${rbool(v.tail === 'lower')})` };

  out[`${prefix}ProbabilitiesInter`] = { ds: false,
    fields: [...params,
      { k: 'from', type: 'text', optional: true, def: '', label: 'From (>)', pattern: /^[\s,\-+.\dEeInf]*$/, error: 'Enter numbers separated by commas.', sample: '-1' },
      { k: 'to', type: 'text', optional: true, def: '', label: 'To (<=)', pattern: /^[\s,\-+.\dEeInf]*$/, error: 'Enter numbers separated by commas.', sample: '1' },
      { k: 'flags', type: 'flags', label: 'Options', items: [['plot', 'Plot region', false]] },
      colorField('color', ' color: ', 'gray'),
      { k: 'legend', type: 'choice', label: 'Legend position', choices: LEGEND_POSITIONS }],
    check(v) {
      const from = numberList(v.from), to = numberList(v.to);
      if (!from.length && !to.length) return 'No values specified.';
      if (!validNumbers(from) || !validNumbers(to)) return 'The values must be a list of numbers.';
      const lo = from.length ? from.map(Number) : [-Infinity], hi = to.length ? to.map(Number) : [Infinity];
      const n = Math.max(lo.length, hi.length);
      for (let i = 0; i < n; i++) if (!(hi[i % hi.length] > lo[i % lo.length])) return "'to' must be greater than 'from'.";
      return famCheck?.(v);
    },
    code(v) {
      const from = numberList(v.from).join(',') || '-Inf', to = numberList(v.to).join(',') || 'Inf';
      const n = Math.max(numberList(v.from).length, numberList(v.to).length, 1);
      const regions = Array.from({ length: n }, (_, i) => `c(${(numberList(v.from).length ? numberList(v.from) : ['-Inf'])[i % Math.max(numberList(v.from).length, 1)]}, ${(numberList(v.to).length ? numberList(v.to) : ['Inf'])[i % Math.max(numberList(v.to).length, 1)]})`);
      const ylab = fam.discrete ? 'Probability Mass' : 'Density';
      return lines('local({', `  .D <- ${distribution(fam, v)}`, `  .fr <- c(${from})`, `  .to <- c(${to})`, '  .p <- distr::p(.D)(.to) - distr::p(.D)(.fr)',
        '  cat(paste("P(",.fr," < X <= ",.to,") = ",.p,sep="",collapse="\\n"),"\\n")',
        v.flags.plot && `  .col <- ${shades(v.color, n)}`,
        v.flags.plot && `  plotRegions(.D, regions=list(${regions.join(', ')}), col=.col, legend=FALSE, to.draw.arg=1, mfColRow=FALSE, xlab=${rs(fam.discrete ? fam.xlab : 'x')}, ylab=${rs(ylab)}, main=paste(${rs(mainTitle(fam, v))}))`,
        v.flags.plot && `  legend(${rs(v.legend)},legend=c(paste("P(",.fr," < X <= ",.to,")=",round(.p,4),sep="")), col=.col,pch = 15, pt.cex = 2.5,inset=0.02)`, '})');
    } };

  if (fam.discrete) {
    out[`${prefix}DistrMass`] = { ds: false,
      fields: [...params, { k: 'flags', type: 'flags', label: 'Options', items: [['cum', 'Show cumulative probabilities', false]] }],
      check: famCheck,
      code: v => lines('local({', `  .D <- ${distribution(fam, v)}`, '  .p <- distr::d(.D)(distr::support(.D))',
        `  .Table <- data.frame(Probability=.p${v.flags.cum ? ', Cumulative=cumsum(.p)' : ''})`, '  rownames(.Table) <- distr::support(.D)', '  print(.Table)', '})') };
  }

  out[`${prefix}DistrPlot`] = { ds: false,
    fields: [...params,
      { k: 'flags', type: 'flags', label: 'Select function to plot:', items: [['cum', 'Plot distribution function', false], ['dens', fam.discrete ? 'Plot probability mass function' : 'Plot density function', true]] },
      { k: 'by', type: 'choice', label: 'Optionally specify regions under the density function by', choices: [['values', 'x-values'], ['quantiles', 'quantiles']] },
      { k: 'from1', type: 'text', optional: true, def: '', label: 'From', pattern: /^\s*(-?Inf|[-+]?\d*\.?\d+([eE][-+]?\d+)?)?\s*$/, error: 'Enter a number.', sample: '-1' },
      { k: 'to1', type: 'text', optional: true, def: '', label: 'To', pattern: /^\s*(-?Inf|[-+]?\d*\.?\d+([eE][-+]?\d+)?)?\s*$/, error: 'Enter a number.', sample: '1' },
      colorField('color1', ' color: ', 'gray'),
      { k: 'from2', type: 'text', optional: true, def: '', label: 'From', pattern: /^\s*(-?Inf|[-+]?\d*\.?\d+([eE][-+]?\d+)?)?\s*$/, error: 'Enter a number.', sample: '0.2' },
      { k: 'to2', type: 'text', optional: true, def: '', label: 'To', pattern: /^\s*(-?Inf|[-+]?\d*\.?\d+([eE][-+]?\d+)?)?\s*$/, error: 'Enter a number.', sample: '0.4' },
      colorField('color2', ' color: ', 'gray'),
      { k: 'legend', type: 'choice', label: 'Legend position', choices: LEGEND_POSITIONS }],
    check: v => (!v.flags.cum && !v.flags.dens ? 'No plot selected.' : v.from1.trim() && !v.to1.trim() ? "You must specify 'from' and 'to' for at least one range." : famCheck?.(v)),
    code(v) {
      const main = `main=paste(${rs(mainTitle(fam, v))})`;
      const ylab = fam.discrete ? 'Probability Mass' : 'Density';
      const xlab = fam.discrete ? fam.xlab : 'x';
      const both = v.flags.cum && v.flags.dens;
      const regions = v.flags.dens && v.from1.trim() && v.to1.trim();
      const edge = value => (v.by === 'quantiles' ? `distr::q(.D)(${value.trim() || '0'})` : value.trim() || '-Inf');
      const region = (a, b) => `c(${edge(a)}, ${v.by === 'quantiles' && !b.trim() ? '1' : b.trim() ? edge(b) : 'Inf'})`;
      const cum = v.flags.cum && `\n  plotRegions(.D, to.draw.arg=2, pch.u="", cex.points=par("cex"), verticals=FALSE, mfColRow=FALSE, xlab=${rs(xlab)}, ylab="Cumulative Probability", ${main})`;
      let dens = '';
      if (v.flags.dens && !regions) dens = `\n  plotRegions(.D, to.draw.arg=1, mfColRow=FALSE, xlab=${rs(xlab)}, ylab=${rs(ylab)}, ${main})`;
      if (regions) {
        const second = v.from2.trim() && v.to2.trim();
        dens = `\n  plotRegions(.D, regions=list(${region(v.from1, v.to1)}${second ? `, ${region(v.from2, v.to2)}` : ''}), col=c(${rs(v.color1)}${second ? `, ${rs(v.color2)}` : ''}), ` +
          `legend.pos=${rs(v.legend)}, to.draw.arg=1, mfColRow=FALSE, xlab=${rs(xlab)}, ylab=${rs(ylab)}, ${main})`;
      }
      return ['local({', `  .D <- ${distribution(fam, v)}`, both && '  opar <- par(mfrow=c(1,2))', cum && cum.replace(/^\n/, ''), dens && dens.replace(/^\n/, ''), both && '  par(opar)', '})'].filter(Boolean).join('\n');
    } };

  out[`${prefix}DistrCharac`] = { ds: false,
    fields: [...params,
      { k: 'flags', type: 'flags', label: 'Characteristics', items: [['expectation', 'Expectation', true], ['median', 'Median', false], ['sd', 'Standard Deviation', true], ['IQR', 'Interquartile Range', false], ['skewness', 'Skewness', false], ['kurtosis', 'Kurtosis', false], ['moment', 'Moment of order:', false], ['cmoment', 'Central moment of order:', false]] },
      { k: 'k', type: 'num', int: true, min: 1, def: '2', label: 'Moment of order:', when: v => v.flags.moment },
      { k: 'ck', type: 'num', int: true, min: 1, def: '2', label: 'Central moment of order:', when: v => v.flags.cmoment }],
    check: v => (!Object.values(v.flags).some(Boolean) ? 'No characteristics selected.' : famCheck?.(v)),
    code(v) {
      const chosen = Object.keys(v.flags).filter(k => v.flags[k]);
      return `characRV(${distribution(fam, v)}, charact=c(${chosen.map(rs).join(', ')})${v.flags.moment ? `, moment=${v.k}` : ''}${v.flags.cmoment ? `, cmoment=${v.ck}` : ''})`;
    } };

  const name = `${fam.title}Samples`;
  out[`${prefix}DistrSamples`] = { ds: false, activeDataset: v => v.name,
    fields: [{ k: 'name', type: 'name', label: 'Enter name for data set:', def: name }, ...params,
      { k: 'nsamples', type: 'num', int: true, positive: true, def: '100', label: 'Number of samples' },
      { k: 'nobs', type: 'num', int: true, positive: true, def: '1', label: 'Sample size' },
      { k: 'flags', type: 'flags', label: 'Add to data set:', items: [['mean', 'Mean', false], ['sum', 'Sum', false], ['sd', 'Standard Deviation', false]] }],
    check: famCheck,
    code(v) {
      const n = v.name, obs = Number(v.nobs), samples = Number(v.nsamples);
      const summaries = [v.flags.mean && `  mean <- rowMeans(${n}[,1:${obs}])`, v.flags.sum && `  sum <- rowSums(${n}[,1:${obs}])`, v.flags.sd && `  sd <- apply(${n}[,1:${obs}], 1, sd)`].filter(Boolean);
      return lines(`${n} <- as.data.frame(matrix(distr::r(${distribution(fam, v)})(${samples}*${obs}), ncol=${obs}))`,
        samples === 1 ? `rownames(${n}) <- "sample"` : `rownames(${n}) <- paste("sample", 1:${samples}, sep="")`,
        obs === 1 ? `colnames(${n}) <- "obs"` : `colnames(${n}) <- paste("obs", 1:${obs}, sep="")`,
        summaries.length && `${n} <- within(${n}, {\n${summaries.join('\n')}\n})`);
    } };
  // The plug-in attaches distr before generating any of this (its plotting and characteristics functions
  // rely on distr being on the search path), and so does the code here.
  for (const spec of Object.values(out)) { const code = spec.code; spec.code = (v, c) => `library(distr)\n${code(v, c)}`; }
  return out;
}

const distributions = Object.assign({}, ...FAMILIES.map(distributionCommands));

module.exports = {
  ...distributions,
  resumenVariablesCualitativas: {
    fields: [
      { k: 'nominal', type: 'var', kind: 'factor', multi: true, min: 0, label: 'Nominal variables' },
      { k: 'ordinal', type: 'var', kind: 'factor', multi: true, min: 0, label: 'Ordinal variables' },
      { k: 'flags', type: 'flags', label: 'Options', items: [['sort', 'Sort by frequency', false]] },
      { k: 'p', type: 'num', min: 0, max: 1, def: '0.5', label: 'Quantile:' }],
    check: v => (v.nominal.length || v.ordinal.length ? undefined : 'At least one variable must be selected'),
    code(v, c) {
      const frame = vars => (!vars.length ? 'NULL' : vars.length === 1 ? `${c.ds}[${rs(vars[0])}]` : `${c.ds}[,${rc(vars)}]`);
      return `calcular_frecuencia(df.nominal=${frame(v.nominal)}, ordenado.frec=${rbool(v.flags.sort)}, df.ordinal=${frame(v.ordinal)}, cuantil.p=${v.p}, iprint = TRUE)`;
    } },

  resumenNumericoVContinua: {
    fields: [numVars('xs', 'Variables (pick one or more)'), groups('g', 'Group (pick one)'), statsField(), quantilesField, typeField,
      { k: 'flags', type: 'flags', label: 'Frequency table', items: tableFlag }, ...breaksFields()],
    code: (v, c) => `calcularResumenVariablesContinuas(data=${dsCols(c, v.xs)}${v.g ? `, groups=${groupArg(c, v.g)}` : ''}, statistics=${statistics(v)}, ` +
      `quantiles=${quantiles(v)}${v.type && (v.stats.skewness || v.stats.kurtosis) ? `, type=${rs(v.type)}` : ''}, tablaFrecuencia=${rbool(v.flags.table)}, cortes=${breaks(v)})` },

  resumenNumericoVDiscreta: {
    fields: [numVars('xs', 'Variables (pick one or more)'), groups('g', 'Group (pick one)'), statsField(), quantilesField,
      { k: 'flags', type: 'flags', label: 'Frequency table', items: tableFlag }, ...breaksFields()],
    code: (v, c) => `calcularResumenVariablesDiscretas(data=${dsCols(c, v.xs)}, statistics =${statistics(v)}, quantiles = ${quantiles(v)}, ` +
      `groups=${groupArg(c, v.g)}, tablaFrecuencia=${rbool(v.flags.table)}, cortes=${breaks(v)})` },

  resumenNumericoPonderada: {
    fields: [numVars('xs', 'Variables (pick one or more)'), numVar('w', 'Weight variable', { exclude: ['xs'] }), groups('g', 'Group (pick one)'), statsField(), quantilesField, typeField],
    code: (v, c) => `W.numSummary(data=${dsCols(c, v.xs)}, statistics =${statistics(v)}, quantiles = ${quantiles(v)}, weights=${c.ds}$${S(v.w)}, groups=${groupArg(c, v.g)})` },

  resumenDatosTabulados: {
    fields: [numVar('lo', 'Lower bound'), numVar('up', 'Upper bound', { exclude: ['lo'] }), numVar('ni', 'Frequency', { exclude: ['lo', 'up'] }),
      flagsOf('Statistics', [...STATS.slice(0, 4), ['mode', 'Mode', false], ...STATS.slice(4)]), quantilesField,
      { k: 'flags', type: 'flags', label: 'Frequency table', items: tableFlag }],
    code: (v, c) => `calcularResumenDatosTabulados(l_inf=${c.ds}$${S(v.lo)}, l_sup=${c.ds}$${S(v.up)}, ni=${c.ds}$${S(v.ni)}, statistics =${statistics(v)}, ` +
      `quantiles = ${quantiles(v)}, tablaFrecuencia=${rbool(v.flags.table)})` }
};

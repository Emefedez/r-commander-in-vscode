// Commands of the "Basic Statistics" menu that the RcmdrPlugin.TeachStat plug-in adds to R Commander.
// Labels reuse the plug-in's own English strings, so they pick up its Spanish translation, and the code is
// the one its dialogs generate (the functions come from the plug-in, loaded by attach_rcmdr()).
const { rs, rc, rbool, S, splitList } = require('../lib/rhelpers');
const { numVar, numVars, factor, groups } = require('./common');

const flagsOf = (label, items, extra = {}) => ({ k: 'stats', type: 'flags', label, items, ...extra });
const lines = (...parts) => parts.flat().filter(Boolean).join('\n');

const STATS = [['mean', 'Mean', true], ['sd', 'Standard Deviation', true], ['se(mean)', 'Standard Error of Mean', false], ['IQR', 'Interquartile Range', true],
  ['quantiles', 'Quantiles:', true], ['cv', 'Coefficient of Variation', false], ['skewness', 'Skewness', false], ['kurtosis', 'Kurtosis', false]];
const statsField = (extra = []) => flagsOf('', [...STATS.slice(0, 4), ...extra, ...STATS.slice(4)], { prompt: 'Statistics' });
const quantilesField = { k: 'q', type: 'numlist', label: '', prompt: 'Quantiles:', def: '0,0.25,0.5,0.75,1', when: v => v.stats.quantiles };
const typeField = { k: 'type', type: 'choice', label: '', prompt: 'Type of skewness and kurtosis', choices: [['1', 'Type 1'], ['2', 'Type 2'], ['3', 'Type 3']], def: '2',
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
  { id: 'generic', title: 'Generic', generic: 'AbscontDistribution', params: [['dist', 'Distribution (pick one)']] },
  { id: 'Dgeneric', title: 'Generic', sampleName: 'DGenericSamples', generic: 'DiscreteDistribution', discrete: true, xlab: 'x', params: [['dist', 'Distribution (pick one)']] },
  { id: 'negbinomial', title: 'NegativeBinomial', ctor: 'Nbinom', discrete: true, xlab: 'Number of Failures Until Target Successes',
    params: [['size', 'Target number of successes', '0', { min: 0, round: true }], ['prob', 'Probability of success', '0.5', { min: 0, max: 1 }]] }
];
const objectsOfClass = cls => `local({ n <- ls(globalenv()); n[vapply(n, function(x) methods::is(get(x, globalenv()), "${cls}"), logical(1))] })`;
const paramFields = fam => fam.generic ? [{ k: 'p_dist', type: 'rlist', single: true, selectFirst: true, label: 'Distribution (pick one)', expr: () => objectsOfClass(fam.generic) }] : fam.params.map(([k, label, def, o = {}]) => ({ k: `p_${k}`, type: 'num', label, def, ...(o.positive && { positive: true }), ...(o.min !== undefined && { min: o.min }), ...(o.max !== undefined && { max: o.max }) }));
const paramValue = (fam, v, k) => {
  const o = fam.params.find(p => p[0] === k)[3] || {};
  const n = Number(v[`p_${k}`]);
  return String(o.round ? Math.round(n) : n);
};
// The distribution as the plug-in writes it, e.g. Norm(mean=0, sd=1), qualified so distr need not be attached.
const distribution = (fam, v) => fam.generic ? [].concat(v.p_dist)[0] : `distr::${fam.ctor}(${fam.params.map(([k]) => `${k}=${paramValue(fam, v, k)}`).join(', ')})`;
const mainTitle = (fam, v) => {
  if (fam.generic) return `${fam.title} Distribution: Distribution=${[].concat(v.p_dist)[0]}`;
  const text = fam.id === 'negbinomial' ? `Trials=${paramValue(fam, v, 'size')}, Prob=${paramValue(fam, v, 'prob')}`
    : fam.id === 'F' ? `Numerator df = ${paramValue(fam, v, 'df1')}, Denominator df = ${paramValue(fam, v, 'df2')}`
      : fam.params.map(([k, label]) => `${label}=${paramValue(fam, v, k)}`).join(', ');
  return `${fam.title} Distribution: ${text}`;
};
const colorField = (k, label, def) => ({ k, type: 'text', def, label, compact: true, pattern: /^\S+$/, error: 'Enter a color name or a hex code.' });
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
      { k: 'tail', type: 'choice', label: '', prompt: 'Tail', choices: [['lower', 'Lower tail'], ['upper', 'Upper tail']] }],
    check: famCheck,
    code: v => `distr::q(${distribution(fam, v)})(c(${v.probs.join(',')}), lower.tail=${rbool(v.tail === 'lower')})` };

  out[`${prefix}ProbabilitiesInter`] = { ds: false,
    fields: [...params,
      { k: 'hp', type: 'note', heading: true, label: 'Probabilities:' },
      { k: 'from', type: 'text', optional: true, def: '', label: 'From (>)', pattern: /^[\s,\-+.\dEeInf]*$/, error: 'Enter numbers separated by commas.', sample: '-1' },
      { k: 'to', type: 'text', optional: true, def: '', label: 'To (<=)', pattern: /^[\s,\-+.\dEeInf]*$/, error: 'Enter numbers separated by commas.', sample: '1' },
      { k: 'flags', type: 'flags', label: '', items: [['plot', 'Plot region', false]] },
      colorField('color', ' color: ', 'gray'),
      { k: 'legend', type: 'choice', label: 'Position of Legend', choices: [['topright', 'Top right'], ['topleft', 'Top left'], ['top', 'Top center']] }],
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
      fields: [...params, { k: 'flags', type: 'flags', label: '', items: [['cum', 'Show cumulative probabilities', false]] }],
      check: famCheck,
      code: v => lines('local({', `  .D <- ${distribution(fam, v)}`, '  .p <- distr::d(.D)(distr::support(.D))',
        `  .Table <- data.frame(Probability=.p${v.flags.cum ? ', Cumulative=cumsum(.p)' : ''})`, '  rownames(.Table) <- distr::support(.D)', '  print(.Table)', '})') };
  }

  out[`${prefix}DistrPlot`] = { ds: false,
    fields: [...params,
      { k: 'flags', type: 'flags', label: 'Select function to plot:', items: [['cum', 'Plot distribution function', false], ['dens', fam.discrete ? 'Plot probability mass function' : 'Plot density function', true]] },
      { k: 'by', type: 'choice', label: 'Optionally specify regions under the density function by', choices: [['values', 'x-values'], ['quantiles', 'quantiles']] },
      { k: 'hr', type: 'note', heading: true, label: 'Regions to Fill (specify one or two, or leave blank)' },
      { k: 'from1', type: 'text', optional: true, def: '', compact: true, label: 'Region 1: from ', pattern: /^\s*(-?Inf|[-+]?\d*\.?\d+([eE][-+]?\d+)?)?\s*$/, error: 'Enter a number.', sample: '-1' },
      { k: 'to1', type: 'text', optional: true, def: '', compact: true, label: ' to ', pattern: /^\s*(-?Inf|[-+]?\d*\.?\d+([eE][-+]?\d+)?)?\s*$/, error: 'Enter a number.', sample: '1' },
      colorField('color1', ' color ', 'gray'),
      { k: 'from2', type: 'text', optional: true, def: '', compact: true, label: 'Region 2: from ', pattern: /^\s*(-?Inf|[-+]?\d*\.?\d+([eE][-+]?\d+)?)?\s*$/, error: 'Enter a number.', sample: '0.2' },
      { k: 'to2', type: 'text', optional: true, def: '', compact: true, label: ' to ', pattern: /^\s*(-?Inf|[-+]?\d*\.?\d+([eE][-+]?\d+)?)?\s*$/, error: 'Enter a number.', sample: '0.4' },
      colorField('color2', ' color ', 'gray'),
      { k: 'legend', type: 'choice', label: 'Position of Legend', choices: [['topright', 'Top right'], ['topleft', 'Top left'], ['top', 'Top center']] }],
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

  const name = fam.sampleName || `${fam.title}Samples`;
  out[`${prefix}DistrSamples`] = { ds: false, activeDataset: v => v.name,
    fields: [{ k: 'name', type: 'name', label: 'Enter name for data set:', def: name }, ...params,
      { k: 'nsamples', type: 'num', int: true, positive: true, def: '100', label: 'Number of samples (rows) ' },
      { k: 'nobs', type: 'num', int: true, positive: true, def: '1', label: 'Number of observations (columns) ' },
      { k: 'flags', type: 'flags', label: 'Add to Data Set:', items: [['mean', 'Sample means', false], ['sum', 'Sample sums', false], ['sd', 'Sample standard deviations', false]] }],
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

// ---- Defining a generic distribution ------------------------------------------------------------------------------------
const PIECES = [1, 2, 3, 4];
const numberOrBlank = /^\s*(-?Inf|[-+]?\d*\.?\d+([eE][-+]?\d+)?)?\s*$/;
const piece = k => PIECES.flatMap(i => (i < k ? [] : [
  { k: `def${i}`, type: 'text', label: 'Definition', prompt: `Definition ${i}`, def: i === 1 ? '2*x' : '', optional: i > 1, sample: 'x',
    when: v => i === 1 || (v[`def${i - 1}`] || '').trim() !== '' },
  { k: `from${i}`, type: 'text', optional: true, def: i === 1 ? '0' : '', label: 'From', compact: true, pattern: numberOrBlank, error: 'Enter a number.', sample: String(i - 1), when: v => i === 1 || (v[`def${i - 1}`] || '').trim() !== '' },
  { k: `to${i}`, type: 'text', optional: true, def: i === 1 ? '1' : '', label: 'To', compact: true, pattern: numberOrBlank, error: 'Enter a number.', sample: String(i), when: v => i === 1 || (v[`def${i - 1}`] || '').trim() !== '' }]));
const definedPieces = v => PIECES.filter(i => (v[`def${i}`] || '').trim() !== '').map(i => ({ def: v[`def${i}`].trim(), from: (v[`from${i}`] || '').trim(), to: (v[`to${i}`] || '').trim() }));

const defineContinuous = {
  fields: [{ k: 'name', type: 'name', label: 'Enter name for the distribution', def: 'MyDistribution' },
    { k: 'densorcum', type: 'choice', label: 'Select function to provide:', choices: [['dens', 'Density function'], ['cum', 'Distribution function']] }, ...piece(1)],
  check(v) {
    const pieces = definedPieces(v);
    const from = pieces.map((p, i) => (p.from === '' ? (i === 0 ? -Infinity : NaN) : Number(p.from)));
    const to = pieces.map((p, i) => (p.to === '' ? (i === pieces.length - 1 ? Infinity : NaN) : Number(p.to)));
    if (from.some(Number.isNaN)) return "Some 'from' not specified.";
    if (to.some(Number.isNaN)) return "Some 'to' not specified.";
    if (!from.every((f, i) => f < to[i])) return "'to' must be greater than 'from'.";
    if (!to.slice(0, -1).every((t0, i) => t0 <= from[i + 1])) return 'Overlapping definitions.';
    if (!to.slice(0, -1).every((t0, i) => t0 === from[i + 1])) return 'Definition intervals must be consecutive.';
    return undefined;
  },
  code(v) {
    const pieces = definedPieces(v);
    const from1 = pieces[0].from === '' ? '-Inf' : pieces[0].from;
    const toLast = pieces[pieces.length - 1].to === '' ? 'Inf' : pieces[pieces.length - 1].to;
    const ineq = pieces.length === 1 ? ' <= ' : ' < ';
    const low = from1 !== '-Inf' ? `, low1=${from1}` : '';
    const up = toLast !== 'Inf' ? `, up1=${toLast}` : '';
    const dens = v.densorcum === 'dens';
    let func = dens ? `function(y) sapply(y, function(x) {\n\t\t\t d <- if(x < ${from1}){\n\t\t\t\t\t 0` : `function(y) sapply(y, function(x, ...) {\n\t\t\t p <- if(x < ${from1}){\n\t\t\t\t\t 0`;
    pieces.forEach((p, i) => { func += `\n\t\t\t\t } else if(x${ineq}${p.to === '' ? 'Inf' : p.to}){\n\t\t\t\t\t ${dens ? p.def : `eval(D(expression(${p.def}),"x"))`}`; });
    func += `\n\t\t\t\t } else{\n\t\t\t\t\t 0 \n\t\t\t\t }\n\t\t\t return(${dens ? 'd' : 'p'})\n\t\t})${low}${up}, withStand=TRUE`;
    return `library(distr)\n${v.name} <- AbscontDistribution(d = ${func})`;
  }
};
const defineDiscrete = {
  fields: [{ k: 'name', type: 'name', label: 'Enter name for the distribution', def: 'MyDiscreteDistribution' },
    { k: 'massorcum', type: 'choice', label: 'Select function to provide:', choices: [['mass', 'Probability mass function'], ['cum', 'Distribution function']] },
    { k: 'supp', type: 'numlist', label: 'Support', def: '0,1,2' }, { k: 'proba', type: 'text', optional: true, def: '', label: 'Probabilities', pattern: /^[\s,\d.eE+-]*$/, error: 'Enter numbers separated by commas.', sample: '0,0,1' }],
  check(v) {
    const supp = v.supp.map(Number);
    if (supp.some((x, i) => i && x <= supp[i - 1])) return 'Support is not ordered.';
    const proba = numberList(v.proba).map(Number);
    if (proba.length && proba.length !== supp.length) return 'The support and the probabilities must have the same number of values.';
    if (v.massorcum === 'cum' && proba.length) {
      if (proba.some((x, i) => i && x < proba[i - 1])) return 'Probabilities are not ordered.';
      if (Math.abs(proba[proba.length - 1] - 1) > 1e-9) return 'Last probability must be 1.';
    }
    return undefined;
  },
  code(v) {
    const proba = numberList(v.proba).map(Number);
    const masses = v.massorcum === 'cum' && proba.length ? proba.map((x, i) => (i ? x - proba[i - 1] : x)) : proba;
    const clean = x => String(Math.round(x * 1e12) / 1e12);
    return `library(distr)\n${v.name} <- DiscreteDistribution(c(${v.supp.join(',')})${masses.length ? `, c(${masses.map(clean).join(',')})` : ''})`;
  }
};

// Commands the plug-in adds to R Commander's Statistics menus (means, nonparametric tests).
const extras = {
  oneWayAnovaRE: { activeModel: v => (v.method === 'mm' ? v.name : undefined),
    fields: [{ k: 'name', type: 'name', label: 'Enter name for model: ', def: c => c.fresh('AoVREModel') }, factor('g', 'Groups (pick one)'), numVar('y', 'Response Variable (pick one)'),
      { k: 'method', type: 'choice', label: 'Variance estimations:', choices: [['mm', 'Moments'], ['ml', 'Maximum likelihood'], ['reml', 'Restricted maximum likelihood (REML)']] }],
    code: (v, c) => lines(`with(${c.ds}, numSummary(${S(v.y)}, groups=${S(v.g)}, statistics=c("mean", "sd")))`,
      v.method === 'mm' ? `${v.name} <- aovremm(${S(v.y)} ~ ${S(v.g)}, data=${c.ds})$model`
        : `${v.name} <- aovreml(${S(v.y)} ~ ( 1 | ${S(v.g)} ), data=${c.ds}, REML=${rbool(v.method === 'reml')}, Lconfint=TRUE)$model`) },
  randomnessFTest: { fields: [{ k: 'x', type: 'var', kind: 'twolevel', label: 'Variable (pick one)' }],
    code: (v, c) => `with(${c.ds}, twolevelfactor.runs.test(${S(v.x)}))` },
  randomnessNTest: { fields: [numVar('x', 'Variable (pick one)'), { k: 'flags', type: 'flags', label: '', items: [['plot', 'Show graphically', false]] },
      { k: 'threshold', type: 'text', optional: true, def: '', label: 'Cut-point (median by default):', pattern: /^\s*[-+]?\d*\.?\d+([eE][-+]?\d+)?\s*$/, error: 'Cut-point must be numeric or NULL', sample: '1' }],
    code: (v, c) => `with(${c.ds}, numeric.runs.test(${S(v.x)}, threshold=${v.threshold.trim() ? Number(v.threshold) : `median(${S(v.x)},na.rm=TRUE)`}, plot=${rbool(v.flags.plot)}))` }
};

module.exports = {
  ...distributions,
  ...extras,
  genericDistrDefine: { ds: false, ...defineContinuous },
  DgenericDistrDefine: { ds: false, ...defineDiscrete },
  resumenVariablesCualitativas: {
    fields: [
      { k: 'nominal', type: 'var', kind: 'nominal', multi: true, min: 0, label: 'Nominal variables' },
      { k: 'ordinal', type: 'var', kind: 'ordinal', multi: true, min: 0, label: 'Ordinal variables' },
      { k: 'flags', type: 'flags', label: '', items: [['sort', 'Sort by frequency', false]] },
      { k: 'p', type: 'num', min: 0, max: 1, def: '0.5', label: 'Quantile:' }],
    check: v => (v.nominal.length || v.ordinal.length ? undefined : 'At least one variable must be selected'),
    code(v, c) {
      const frame = vars => (!vars.length ? 'NULL' : vars.length === 1 ? `${c.ds}[${rs(vars[0])}]` : `${c.ds}[,${rc(vars)}]`);
      return `calcular_frecuencia(df.nominal=${frame(v.nominal)}, ordenado.frec=${rbool(v.flags.sort)}, df.ordinal=${frame(v.ordinal)}, cuantil.p=${v.p}, iprint = TRUE)`;
    } },

  resumenNumericoVContinua: {
    fields: [numVars('xs', 'Variables (pick one or more)'), { ...groups('g', 'Group (pick one)'), compact: true }, statsField(), quantilesField, typeField,
      { k: 'flags', type: 'flags', label: '', items: tableFlag }, ...breaksFields()],
    code: (v, c) => `calcularResumenVariablesContinuas(data=${dsCols(c, v.xs)}${v.g ? `, groups=${groupArg(c, v.g)}` : ''}, statistics=${statistics(v)}, ` +
      `quantiles=${quantiles(v)}${v.type && (v.stats.skewness || v.stats.kurtosis) ? `, type=${rs(v.type)}` : ''}, tablaFrecuencia=${rbool(v.flags.table)}, cortes=${breaks(v)})` },

  resumenNumericoVDiscreta: {
    fields: [numVars('xs', 'Variables (pick one or more)'), { ...groups('g', 'Group (pick one)'), compact: true }, statsField(), quantilesField,
      { k: 'flags', type: 'flags', label: '', items: tableFlag }, ...breaksFields()],
    code: (v, c) => `calcularResumenVariablesDiscretas(data=${dsCols(c, v.xs)}, statistics =${statistics(v)}, quantiles = ${quantiles(v)}, ` +
      `groups=${groupArg(c, v.g)}, tablaFrecuencia=${rbool(v.flags.table)}, cortes=${breaks(v)})` },

  resumenNumericoPonderada: {
    fields: [numVars('xs', 'Variables (pick one or more)'), numVar('w', 'Weight variable', { exclude: ['xs'], compact: true }), { ...groups('g', 'Group (pick one)'), compact: true }, statsField(), quantilesField, typeField],
    code: (v, c) => `W.numSummary(data=${dsCols(c, v.xs)}, statistics =${statistics(v)}, quantiles = ${quantiles(v)}, weights=${c.ds}$${S(v.w)}, groups=${groupArg(c, v.g)})` },

  resumenDatosTabulados: {
    fields: [numVar('lo', 'Lower bound', { compact: true }), numVar('up', 'Upper bound', { exclude: ['lo'], compact: true }), numVar('ni', 'Frequency', { exclude: ['lo', 'up'], compact: true }),
      flagsOf('', [...STATS.slice(0, 4), ['mode', 'Mode', false], ...STATS.slice(4)]), quantilesField,
      { k: 'flags', type: 'flags', label: '', items: tableFlag }],
    code: (v, c) => `calcularResumenDatosTabulados(l_inf=${c.ds}$${S(v.lo)}, l_sup=${c.ds}$${S(v.up)}, ni=${c.ds}$${S(v.ni)}, statistics =${statistics(v)}, ` +
      `quantiles = ${quantiles(v)}, tablaFrecuencia=${rbool(v.flags.table)})` }
};

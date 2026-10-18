// The Distributions menu as in Rcmdr, which builds every dialog from one table of distributions
// (title, R function suffix, parameters with their labels and defaults) and a few generic dialogs.
const DISTRIBUTIONS = [
  // menu id prefix, Rcmdr title, R suffix, [parameter, label, default], parameters rounded, discrete
  ['normal', 'Normal', 'norm', [['mean', 'Mean', '0'], ['sd', 'Standard deviation', '1']]],
  ['t', 't', 't', [['df', 'Degrees of freedom', '']]],
  ['chisq', 'ChiSquared', 'chisq', [['df', 'Degrees of freedom', '']]],
  ['F', 'F', 'f', [['df1', 'Numerator degrees of freedom', ''], ['df2', 'Denominator degrees of freedom', '']]],
  ['exponential', 'Exponential', 'exp', [['rate', 'Rate', '1']]],
  ['uniform', 'Uniform', 'unif', [['min', 'Minimum', '0'], ['max', 'Maximum', '1']]],
  ['beta', 'Beta', 'beta', [['shape1', 'Shape 1', ''], ['shape2', 'Shape 2', '']]],
  ['Cauchy', 'Cauchy', 'cauchy', [['location', 'Location', '0'], ['scale', 'Scale', '1']]],
  ['logistic', 'Logistic', 'logis', [['location', 'Location', '0'], ['scale', 'Scale', '1']]],
  ['lognormal', 'Lognormal', 'lnorm', [['meanlog', 'Mean (log scale)', '0'], ['sdlog', 'Standard deviation (log scale)', '1']]],
  ['gamma', 'Gamma', 'gamma', [['shape', 'Shape', ''], ['scale', 'Scale (inverse rate)', '1']]],
  ['Weibull', 'Weibull', 'weibull', [['shape', 'Shape', ''], ['scale', 'Scale', '1']]],
  ['Gumbel', 'Gumbel', 'gumbel', [['location', 'Location', '0'], ['scale', 'Scale', '1']]],
  ['binomial', 'Binomial', 'binom', [['size', 'Binomial trials', ''], ['prob', 'Probability of success', '0.5']], [0], 'Number of Successes'],
  ['Poisson', 'Poisson', 'pois', [['lambda', 'Mean', '1']], [], 'x'],
  ['geom', 'Geometric', 'geom', [['prob', 'Probability of success', '0.5']], [], 'Number of Failures until Success'],
  ['hyper', 'Hypergeometric', 'hyper', [['m', 'm (number of white balls in the urn)', '1'], ['n', 'n (number of black balls in the urn)', '1'],
    ['k', 'k (number of balls drawn from the urn)', '1']], [0, 1, 2], 'Number of White Balls in Sample'],
  ['negbinomial', 'NegativeBinomial', 'nbinom', [['size', 'Target number of successes', '1'], ['prob', 'Probability of success', '0.5']], [0], 'Number of Failures Until Target Successes']
];

const NUMBER = /^\s*[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?\s*$/;
const paramFields = params => params.map(([k, label, def]) => ({ k, type: 'text', label, def, pattern: NUMBER, error: 'Enter a number.', sample: def || '5' }));
// Parameter values as Rcmdr pastes them: numbers, rounded where the distribution needs whole numbers.
const valuesOf = (v, params, round) => params.map(([k], i) => (round.includes(i) ? Math.round(Number(v[k])) : Number(v[k])));
const args = (v, params, round, lead = '') => params.map(([k], i) => `${lead}${k}=${valuesOf(v, params, round)[i]}`).join(lead ? '' : ', ');
const valuesList = text => text.trim().replace(/,/g, ' ').replace(/ +/g, ',');
const tail = { k: 'tail', type: 'choice', label: '', prompt: 'Tail', choices: [['lower', 'Lower tail'], ['upper', 'Upper tail']] };
// A quantile of the distribution, computed in R (Rcmdr writes the plotting range as numbers).
// (the Gumbel functions live in RcmdrMisc, which the session may not have attached).
const qfun = r => (r === 'gumbel' ? 'RcmdrMisc::qgumbel' : `q${r}`);
const quantile = (ui, r, p, a) => ui.query(`${qfun(r)}(${p}${a})`).then(x => Number(x?.[0]));

function build([prefix, title, r, params, round = [], xlab]) {
  const discrete = Boolean(xlab);
  const out = {};
  out[`${prefix}Quantiles`] = { ds: false,
    fields: [{ k: 'values', type: 'text', label: 'Probabilities', def: '', sample: '.95' }, ...paramFields(params), tail],
    code: v => `q${r}(c(${valuesList(v.values)}), ${args(v, params, round)}, lower.tail=${v.tail === 'lower' ? 'TRUE' : 'FALSE'})` };
  out[`${prefix}Probabilities`] = { ds: false,
    fields: [{ k: 'values', type: 'text', label: 'Variable value(s)', def: '', sample: '1' }, ...paramFields(params), tail],
    code: v => `p${r}(c(${valuesList(v.values)}), ${args(v, params, round)}, lower.tail=${v.tail === 'lower' ? 'TRUE' : 'FALSE'})` };
  if (discrete) {
    out[`${prefix}Mass`] = { ds: false, fields: paramFields(params),
      async after(v, ui) {
        if (r === 'binom') return true;
        v.xmin = await quantile(ui, r, '.0005', args(v, params, round, ', '));
        v.xmax = await quantile(ui, r, '.9995', args(v, params, round, ', '));
        return Number.isFinite(v.xmin) && Number.isFinite(v.xmax);
      },
      code(v) {
        if (r === 'binom') {
          const [size, prob] = valuesOf(v, params, round);
          return `local({\n  .Table <- data.frame(Probability=dbinom(0:${size}, size=${size}, prob=${prob}))\n  rownames(.Table) <- 0:${size} \n  print(.Table)\n})`;
        }
        return `local({\n  .Table <- data.frame(Probability=d${r}(${v.xmin}:${v.xmax}${args(v, params, round, ', ')}))\n  rownames(.Table) <- ${v.xmin}:${v.xmax} \n  print(.Table)\n})`;
      } };
    out[`${prefix}DistributionPlot`] = { ds: false,
      fields: [...paramFields(params), { k: 'fun', type: 'choice', label: '', prompt: 'Plot', choices: [['Probability', 'Plot probability mass function'], ['Cumulative Probability', 'Plot distribution function']] }],
      async after(v, ui) {
        v.min = await quantile(ui, r, '.0005', args(v, params, round, ', '));
        v.max = await quantile(ui, r, '.9995', args(v, params, round, ', '));
        return Number.isFinite(v.min) && Number.isFinite(v.max);
      },
      code(v) {
        const vals = valuesOf(v, params, round);
        const main = r === 'nbinom' ? `Trials=${vals[0]}, Prob=${vals[1]}` : r === 'hyper' ? `m=${vals[0]}, n=${vals[1]}, k=${vals[2]}` : params.map(([, label], i) => `${label}=${vals[i]}`).join(', ');
        return v.fun === 'Probability'
          ? `local({\n  .x <- ${v.min}:${v.max}\n  plotDistr(.x, d${r}(.x${args(v, params, round, ', ')}), xlab="${xlab}", ylab="Probability Mass", main="${title} Distribution: ${main}", discrete=TRUE)\n})`
          : `local({\n  .x <- ${v.min}:${v.max}\n  plotDistr(.x, p${r}(.x${args(v, params, round, ', ')}), xlab="${xlab}",ylab="Cumulative Probability", main="${title} Distribution: ${main}", discrete=TRUE)\n})`;
      } };
  } else {
    out[`${prefix}DistributionPlot`] = { ds: false,
      fields: [...paramFields(params),
        { k: 'fun', type: 'choice', label: '', prompt: 'Plot', choices: [['Density', 'Plot density function'], ['Cumulative Probability', 'Plot distribution function']] },
        { k: 'h', type: 'note', heading: true, label: 'Regions to Fill (specify one or two, or leave blank)', when: v => v.fun === 'Density' },
        { k: 'by', type: 'choice', label: 'Optionally specify regions under the density function by', choices: [['values', 'x-values'], ['quantiles', 'quantiles']], when: v => v.fun === 'Density' },
        { k: 'from1', type: 'text', optional: true, def: '', label: 'Region 1: from ', compact: true, when: v => v.fun === 'Density' },
        { k: 'to1', type: 'text', optional: true, def: '', label: ' to ', compact: true, when: v => v.fun === 'Density' },
        { k: 'col1', type: 'text', def: 'gray', label: ' color ', compact: true, when: v => v.fun === 'Density' },
        { k: 'from2', type: 'text', optional: true, def: '', label: 'Region 2: from ', compact: true, when: v => v.fun === 'Density' },
        { k: 'to2', type: 'text', optional: true, def: '', label: ' to ', compact: true, when: v => v.fun === 'Density' },
        { k: 'col2', type: 'text', def: 'gray', label: ' color ', compact: true, when: v => v.fun === 'Density' },
        { k: 'legend', type: 'choice', label: 'Position of Legend', choices: [['topright', 'Top right'], ['topleft', 'Top left'], ['top', 'Top center']], when: v => v.fun === 'Density' }],
      check(v) {
        if (v.fun !== 'Density' || !v.from1.trim()) return undefined;
        const n = s => NUMBER.test(s || '');
        if (!n(v.from1) || !n(v.to1) || Number(v.to1) <= Number(v.from1)) return 'Region 1: the end must be a number greater than the start.';
        if (v.from2.trim() && (!n(v.from2) || !n(v.to2) || Number(v.to2) <= Number(v.from2))) return 'Region 2: the end must be a number greater than the start.';
        if (v.by === 'quantiles' && [v.from1, v.to1, ...(v.from2.trim() ? [v.from2, v.to2] : [])].some(x => Number(x) < 0 || Number(x) > 1)) return 'Quantiles must be between 0 and 1.';
        return undefined;
      },
      async after(v, ui) {
        const a = args(v, params, round, ', ');
        v.min = (await ui.query(`round(${qfun(r)}(.0005${a}),3)`))?.[0];
        v.max = (await ui.query(`round(${qfun(r)}(.9995${a}),3)`))?.[0];
        // Regions given as quantiles become x-values, as Rcmdr does before writing the command.
        if (v.fun === 'Density' && v.from1.trim() && v.by === 'quantiles') {
          for (const k of ['from1', 'to1', ...(v.from2.trim() ? ['from2', 'to2'] : [])]) v[k] = String(await quantile(ui, r, v[k].trim(), a));
        }
        return v.min !== undefined && v.max !== undefined;
      },
      code(v) {
        const vals = valuesOf(v, params, round);
        const main = r === 'f' ? `Numerator df = ${vals[0]}, Denominator df = ${vals[1]}` : params.map(([, label], i) => `${label}=${vals[i]}`).join(', ');
        const density = v.fun === 'Density';
        const head = `local({\n  .x <- seq(${v.min}, ${v.max}, length.out=1000)  \n  plotDistr(.x, ${density ? 'd' : 'p'}${r}(.x${args(v, params, round, ', ')}), cdf=${density ? 'FALSE' : 'TRUE'}, xlab="x", ylab="${v.fun}", main=paste("${title} Distribution: ${main}")`;
        if (!density || !v.from1.trim()) return `${head})\n})`;
        const regions = `regions=list(c(${v.from1.trim()}, ${v.to1.trim()})${v.from2.trim() ? `, c(${v.from2.trim()}, ${v.to2.trim()})` : ''})`;
        return `${head}, ${regions}, col=c('${v.col1.trim()}', '${v.col2.trim()}'), legend.pos='${v.legend}')\n})`;
      } };
  }
  out[`${prefix}DistributionSamples`] = { ds: false, activeDataset: v => v.name,
    fields: [{ k: 'name', type: 'name', label: 'Enter name for data set:', def: `${title}Samples` }, ...paramFields(params),
      { k: 'nsamples', type: 'num', int: true, min: 1, def: '1', label: 'Number of samples (rows) ' },
      { k: 'nobs', type: 'num', int: true, min: 1, def: '100', label: 'Number of observations (columns) ' },
      { k: 'add', type: 'flags', label: 'Add to Data Set:', items: [['mean', 'Sample means', true], ['sum', 'Sample sums', false], ['sd', 'Sample standard deviations', false]] }],
    code(v) {
      const n = v.name, s = Number(v.nsamples), o = Number(v.nobs);
      const adds = [v.add.mean && `\n  mean <- rowMeans(${n}[,1:${o}])`, v.add.sum && `\n  sum <- rowSums(${n}[,1:${o}])`, v.add.sd && `\n  sd <- apply(${n}[,1:${o}], 1, sd)`].filter(Boolean);
      return [`${n} <- as.data.frame(matrix(r${r}(${s}*${o}${args(v, params, round, ', ')}), ncol=${o}))`,
        s === 1 ? `rownames(${n}) <- "sample"` : `rownames(${n}) <- paste("sample", 1:${s}, sep="")`,
        o === 1 ? `colnames(${n}) <- "obs"` : `colnames(${n}) <- paste("obs", 1:${o}, sep="")`,
        o > 1 && adds.length && `${n} <- within(${n}, {${adds.join('')}\n})`].filter(Boolean).join('\n');
    } };
  return out;
}

const catalog = {
  // Rcmdr's slider starts at a random seed.
  setRandomSeed: { ds: false, fields: [{ k: 'seed', type: 'num', int: true, min: 1, max: 100000, label: '', prompt: 'Set Random Number Generator Seed', def: String(1 + Math.floor(Math.random() * 100000)) }],
    code: v => `set.seed(${v.seed})` }
};
for (const d of DISTRIBUTIONS) Object.assign(catalog, build(d));
module.exports = catalog;

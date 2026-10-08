const { rs, rbool, S, rnums } = require('../lib/rhelpers');

const P = {
  mean: ['Mean', '0'], sd: ['Standard deviation', '1', 0], df: ['Degrees of freedom', '5', 0], df1: ['Numerator degrees of freedom', '5', 0],
  df2: ['Denominator degrees of freedom', '5', 0], rate: ['Rate', '1', 0], min: ['Minimum', '0'], max: ['Maximum', '1'],
  shape1: ['Shape 1', '1', 0], shape2: ['Shape 2', '1', 0], location: ['Location', '0'], scale: ['Scale', '1', 0],
  meanlog: ['Mean (log scale)', '0'], sdlog: ['Standard deviation (log scale)', '1', 0], shape: ['Shape', '1', 0],
  size: ['Number of trials', '10', 1, true], prob: ['Probability of success', '0.5', 0, false, 1], lambda: ['Mean (lambda)', '1', 0],
  m: ['White balls in the urn (m)', '5', 0, true], n: ['Black balls in the urn (n)', '5', 0, true], k: ['Balls drawn (k)', '3', 0, true],
  nsize: ['Target number of successes', '3', 1]
};
const param = (k, rname = k) => {
  const [label, def, min, int, max] = P[k];
  return { k: rname, type: 'num', label, def, min, max, int };
};

// id prefix used by the Rcmdr menus, R suffix, parameters, discrete?, package
const DISTRIBUTIONS = [
  ['normal', 'norm', ['mean', 'sd']], ['t', 't', ['df']], ['chisq', 'chisq', ['df']], ['F', 'f', ['df1', 'df2']],
  ['exponential', 'exp', ['rate']], ['uniform', 'unif', ['min', 'max']], ['beta', 'beta', ['shape1', 'shape2']],
  ['Cauchy', 'cauchy', ['location', 'scale']], ['logistic', 'logis', ['location', 'scale']], ['lognormal', 'lnorm', ['meanlog', 'sdlog']],
  ['gamma', 'gamma', ['shape', 'rate']], ['Weibull', 'weibull', ['shape', 'scale']], ['Gumbel', 'gumbel', ['location', 'scale'], false, 'RcmdrMisc'],
  ['binomial', 'binom', ['size', 'prob'], true, undefined, 'Binomial'], ['Poisson', 'pois', ['lambda'], true], ['geom', 'geom', ['prob'], true, undefined, 'Geometric'],
  ['hyper', 'hyper', ['m', 'n', 'k'], true, undefined, 'Hypergeometric'], ['negbinomial', 'nbinom', ['size', 'prob'], true, undefined, 'Negative binomial']
];

const SUPPORT = {
  binom: '0:{size}', pois: '0:qpois(0.9999, {lambda})', geom: '0:qgeom(0.9999, {prob})',
  hyper: 'max(0, {k} - {n}):min({k}, {m})', nbinom: '0:qnbinom(0.9999, {size}, {prob})'
};
const tail = { k: 'tail', type: 'choice', label: 'Tail', choices: [['TRUE', 'Lower tail'], ['FALSE', 'Upper tail']] };

function build([prefix, r, params, discrete, pkg, alias]) {
  const q = pkg ? `${pkg}::` : '';
  const call = (kind, first, v) => `${q}${kind}${r}(${first}, ${params.map(p => `${p === 'nsize' ? 'size' : p} = ${v[p]}`).join(', ')}`;
  const fields = params.map(p => param(p === 'size' && r === 'nbinom' ? 'nsize' : p, p));
  const base = alias || prefix;
  const out = {};
  const id = name => `${prefix}${name}`;
  const pkgs = pkg ? [pkg] : undefined;
  const support = v => SUPPORT[r].replace(/\{(\w+)\}/g, (m, k) => v[k]);
  const pdf = v => `${q}d${r}(.x, ${params.map(p => `${p} = ${v[p]}`).join(', ')})`;
  const cdf = v => `${q}p${r}(.x, ${params.map(p => `${p} = ${v[p]}`).join(', ')})`;

  out[id(discrete ? 'Quantiles' : 'Quantiles')] = { ds: false, pkgs,
    fields: [{ k: 'p', type: 'numlist', label: 'Probabilities (separated by commas)', def: '.95' }, ...fields, tail],
    code: v => `${call('q', `c(${v.p.join(', ')})`, v)}, lower.tail = ${v.tail})` };
  out[id(discrete ? 'Probabilities' : 'Probabilities')] = { ds: false, pkgs,
    fields: [{ k: 'x', type: 'numlist', label: 'Variable value(s) (separated by commas)', def: '0' }, ...fields, tail],
    code: v => `${call('p', `c(${v.x.join(', ')})`, v)}, lower.tail = ${v.tail})` };
  if (discrete) {
    out[id('Mass')] = { ds: false, fields,
      code: v => ['local({', `  .x <- ${support(v)}`, `  .Table <- data.frame(Probability = ${q}d${r}(.x, ${params.map(p => `${p} = ${v[p]}`).join(', ')}))`,
        '  rownames(.Table) <- .x', '  print(.Table)', '})'].join('\n') };
  }
  out[id('DistributionPlot')] = { ds: false, pkgs,
    fields: [...fields, { k: 'plot', type: 'choice', label: 'Plot', choices: [['density', discrete ? 'Probability mass function' : 'Density function'], ['cdf', 'Cumulative distribution function']] }],
    code(v) {
      const arg = params.map(p => `${p} = ${v[p]}`).join(', ');
      const main = rs(`${base} distribution: ${arg}`);
      if (discrete) {
        return ['local({', `  .x <- ${support(v)}`, v.plot === 'cdf'
          ? `  plot(.x, ${cdf(v)}, type = "s", xlab = "x", ylab = "Cumulative probability", main = ${main})`
          : `  plot(.x, ${pdf(v)}, type = "h", xlab = "x", ylab = "Probability mass", main = ${main})`, '})'].join('\n');
      }
      return ['local({', `  .x <- seq(${q}q${r}(0.001, ${arg}), ${q}q${r}(0.999, ${arg}), length.out = 500)`, v.plot === 'cdf'
        ? `  plot(.x, ${cdf(v)}, type = "l", xlab = "x", ylab = "Cumulative probability", main = ${main})`
        : `  plot(.x, ${pdf(v)}, type = "l", xlab = "x", ylab = "Density", main = ${main})`, '})'].join('\n');
    } };
  out[id('DistributionSamples')] = { activeDataset: v => v.name, ds: false, pkgs,
    fields: [{ k: 'name', type: 'name', label: 'Name for the data set', def: `${base.replace(/\s+/g, '')[0].toUpperCase()}${base.replace(/\s+/g, '').slice(1)}Samples` },
      ...fields, { k: 'rows', type: 'num', int: true, min: 1, def: '100', label: 'Number of samples (rows)' },
      { k: 'cols', type: 'num', int: true, min: 1, def: '10', label: 'Number of observations per sample (columns)' },
      { k: 'flags', type: 'flags', label: 'Add to the data set', items: [['mean', 'Sample means', false], ['sum', 'Sample sums', false], ['sd', 'Sample standard deviations', false]] }],
    code(v) {
      const n = v.name, all = `${n}[, 1:${v.cols}]`;
      return [`${n} <- as.data.frame(matrix(${q}r${r}(${v.rows} * ${v.cols}, ${params.map(p => `${p} = ${v[p]}`).join(', ')}), ncol = ${v.cols}))`,
        `rownames(${n}) <- paste("sample", 1:${v.rows}, sep = "")`, `colnames(${n}) <- paste("obs", 1:${v.cols}, sep = "")`,
        v.flags.mean && `${n}$mean <- rowMeans(${all})`, v.flags.sum && `${n}$sum <- rowSums(${all})`,
        v.flags.sd && Number(v.cols) > 1 && `${n}$sd <- apply(${all}, 1, sd)`,
        `head(${n})`].filter(Boolean).join('\n');
    } };
  return out;
}

const catalog = {
  setRandomSeed: { ds: false, fields: [{ k: 'seed', type: 'num', int: true, def: '1', label: 'Seed' }], code: v => `set.seed(${v.seed})` }
};
for (const d of DISTRIBUTIONS) Object.assign(catalog, build(d));
// Rcmdr names the discrete tail-probability and mass commands after the family.
module.exports = catalog;

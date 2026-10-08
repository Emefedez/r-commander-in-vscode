const { rs, rc, rbool, S } = require('../lib/rhelpers');
const { numVar, numVars, factor, groups, labelFields, labelArgs, given, identifyField } = require('./common');

const flagsOf = (label, items) => ({ k: 'flags', type: 'flags', label, items });
const lines = (...parts) => parts.flat().filter(Boolean).join('\n');
const scale = { k: 'scale', type: 'choice', label: 'Axis scaling', choices: [['frequency', 'Frequency counts'], ['percent', 'Percentages'], ['density', 'Densities']] };
const fileType = { k: 'file', type: 'file', mode: 'save', label: 'Save the graph as' };
const LEGEND = ['topright', 'topleft', 'bottomright', 'bottomleft', 'top', 'bottom', 'left', 'right', 'center'];
const legendChoices = LEGEND.map(p => [p, p]);
const id = v => (Number(v.idn) > 0 ? `list(n = ${v.idn}, method = "y")` : 'FALSE');
const levelsField = { k: 'levels', type: 'numlist', label: 'Concentration levels:', def: '0.5, 0.95' };
const spanField = { k: 'span', type: 'num', min: 0.05, max: 1, def: '0.5', label: 'Span for smooth' };
const sizeFields = [
  { k: 'cex', type: 'num', min: 0.1, def: '1', label: 'Point size' },
  { k: 'cexAxis', type: 'num', min: 0.1, def: '1', label: 'Axis text size' },
  { k: 'cexLab', type: 'num', min: 0.1, def: '1', label: 'Axis-labels text size' }
];
const COLORS = {
  rainbow_hcl: n => `colorspace::rainbow_hcl(${n})`, rainbow: n => `rainbow(${n})`, heat: n => `heat.colors(${n})`,
  terrain: n => `terrain.colors(${n})`, topo: n => `topo.colors(${n})`, hcl: n => `hcl.colors(${n})`, gray: n => `gray.colors(${n})`
};
const colorField = { k: 'colors', type: 'choice', label: 'Color Selection',
  choices: [['rainbow_hcl', 'Rainbow (hcl)'], ['rainbow', 'Rainbow'], ['heat', 'Heat'], ['terrain', 'Terrain'], ['topo', 'Topographic'], ['hcl', 'HCL default'], ['gray', 'Grays']] };

module.exports = {
  setPalette: { ds: false, fields: [{ k: 'pal', type: 'choice', label: 'Color palette',
      choices: ['default', 'R3', 'R4', 'ggplot2', 'Okabe-Ito', 'Accent', 'Dark 2', 'Paired', 'Pastel 1', 'Pastel 2', 'Set 1', 'Set 2', 'Set 3', 'Tableau 10', 'Classic Tableau', 'Polychrome 36', 'Alphabet'].map(p => [p, p]) }],
    code: v => `palette(${rs(v.pal)})\npalette()` },

  indexPlot: { pkgs: ['RcmdrMisc'],
    fields: [numVars('xs', 'Variable (pick one or more)'), groups('g', 'Mark by groups'),
      { k: 'type', type: 'choice', label: 'Style of plot', choices: [['h', 'Spikes'], ['p', 'Points']] }, identifyField, ...labelFields(['ylab', 'main'])],
    code: (v, c) => v.xs.map(n => `RcmdrMisc::indexplot(${c.dv(n)}, ${v.g ? `groups = ${c.dv(v.g)}, ` : ''}labels = rownames(${c.ds}), id.method = "y", type = ${rs(v.type)}, id.n = ${v.idn}, ` +
      `ylab = ${rs(given(v.ylab) ? v.ylab.trim() : n)}${given(v.main) ? `, title = ${rs(v.main.trim())}` : ''})`).join('\n') },
  DotPlot: { pkgs: ['RcmdrMisc'],
    fields: [numVar('x'), groups('g'), flagsOf('Plot Options', [['bin', 'Bin variable', false]]),
      { k: 'bins', type: 'num', int: true, min: 2, def: '10', label: 'Number of bins: ', when: v => v.flags.bin }, ...labelFields(['xlab'])],
    code: (v, c) => `RcmdrMisc::Dotplot(${c.dv(v.x)}, ${v.g ? `by = ${c.dv(v.g)}, ` : ''}bin = ${rbool(v.flags.bin)}${v.flags.bin ? `, breaks = ${v.bins}` : ''}, xlab = ${rs(given(v.xlab) ? v.xlab.trim() : v.x)})` },
  Histogram: { pkgs: ['RcmdrMisc'],
    fields: [numVar('x'), groups('g'), { k: 'bins', type: 'text', label: 'Number of bins: ', optional: true, def: '', pattern: /^\d+$/, error: 'Enter a whole number or leave blank.', sample: '8' }, scale, ...labelFields()],
    code: (v, c) => `RcmdrMisc::Hist(${c.dv(v.x)}, ${v.g ? `groups = ${c.dv(v.g)}, ` : ''}scale = ${rs(v.scale)}, breaks = ${v.bins.trim() || '"Sturges"'}, col = "darkgray"${labelArgs(v)})` },
  DiscretePlot: { pkgs: ['RcmdrMisc'], fields: [{ k: 'x', type: 'var', kind: 'numeric', label: 'Variable (pick one)' }, groups('g'),
      { k: 'scale', type: 'choice', label: 'Axis scaling', choices: [['frequency', 'Frequency counts'], ['percent', 'Percentages']] }, ...labelFields()],
    code: (v, c) => `RcmdrMisc::discretePlot(${c.dv(v.x)}, ${v.g ? `by = ${c.dv(v.g)}, ` : ''}scale = ${rs(v.scale)}, xlab = ${rs(given(v.xlab) ? v.xlab.trim() : v.x)}${labelArgs(v, ['ylab', 'main'])})` },
  DensityPlot: { pkgs: ['car'],
    fields: [numVar('x'), groups('g'),
      { k: 'kernel', type: 'choice', label: 'Kernel Function', choices: [['gaussian', 'Gaussian'], ['epanechnikov', 'Epanechnikov'], ['biweight', 'Biweight']] },
      { k: 'method', type: 'choice', label: 'Method', choices: [['adaptive', 'Adaptive kernel'], ['kernel', 'Fixed bandwidth']] },
      { k: 'bw', type: 'text', optional: true, def: '<auto>', label: 'Bandwidth', pattern: /^(<auto>|\s*\d*\.?\d+\s*)$/, error: 'Bandwidth must be <auto> or a positive number', sample: '0.5' },
      { k: 'adjust', type: 'num', min: 0.01, def: '1', label: 'Multiply bandwidth by' },
      { k: 'from', type: 'text', optional: true, def: '<auto>', label: 'From', pattern: /^(<auto>|\s*-?\d*\.?\d+\s*)$/, error: 'Enter a number or <auto>', sample: '0' },
      { k: 'to', type: 'text', optional: true, def: '<auto>', label: 'To', pattern: /^(<auto>|\s*-?\d*\.?\d+\s*)$/, error: 'Enter a number or <auto>', sample: '10' },
      ...labelFields(['xlab', 'ylab'])],
    code(v, c) {
      const range = given(v.from) && given(v.to) ? `, xlim = c(${v.from.trim()}, ${v.to.trim()})` : '';
      const bw = given(v.bw) ? `, bw = ${v.bw.trim()}` : '';
      // The adaptive method takes a kernel function, the fixed one a kernel name.
      const kernel = v.method === 'adaptive' ? { gaussian: 'dnorm', epanechnikov: 'car::depan', biweight: 'car::dbiwt' }[v.kernel] : rs(v.kernel);
      return `car::densityPlot(${v.g ? `${c.S(v.x)} ~ ${c.S(v.g)}, data = ${c.ds}` : c.dv(v.x)}, method = ${rs(v.method)}${bw}, adjust = ${v.adjust}, kernel = ${kernel}${range}${labelArgs(v, ['xlab', 'ylab'])})`;
    } },
  stemAndLeaf: { pkgs: ['aplpack'],
    fields: [numVar('x', 'Variable (pick one)'), { k: 'back', type: 'var', kind: 'twolevel', optional: true, label: 'Plot back-to-back by:' },
      { k: 'leaf', type: 'text', def: 'auto', label: 'Leafs Digit:  ', pattern: /^\s*(auto|-?\d+)\s*$/, error: 'Enter auto or a whole number (the leaf unit is 10^n).' },
      { k: 'parts', type: 'choice', label: 'Parts Per Stem', choices: [['auto', 'Automatic'], ['1', '1'], ['2', '2'], ['5', '5']] },
      { k: 'style', type: 'choice', label: 'Style of Divided Stems', choices: [['Tukey', 'Tukey'], ['bare', 'Repeated stem digits']] },
      flagsOf('Other Options', [['trim', 'Trim outliers', true], ['depths', 'Show depths', true], ['reverse', 'Reverse negative leaves', true]])],
    code(v, c) {
      const unit = v.leaf.trim() === 'auto' ? '' : `, unit = ${10 ** Number(v.leaf)}`;
      const opts = `${v.style === 'bare' ? ', style = "bare"' : ''}${unit}${v.parts === 'auto' ? '' : `, m = ${v.parts}`}` +
        `${v.flags.trim ? '' : ', trim.outliers = FALSE'}${v.flags.depths ? '' : ', depths = FALSE'}${v.flags.reverse ? '' : ', reverse.negative.leaves = FALSE'}, na.rm = TRUE`;
      if (v.back) {
        const g = c.dv(v.back), x = c.dv(v.x);
        return lines('local({', `  .lv <- levels(as.factor(${g}))`, `  invisible(aplpack::stem.leaf.backback(${x}[${g} == .lv[1]], ${x}[${g} == .lv[2]]${opts}))`, '})');
      }
      return `invisible(aplpack::stem.leaf(${c.dv(v.x)}${opts}))`;
    } },
  boxPlot: { fields: [numVars('ys', 'Variable (pick one or more)'), groups('g', 'Plot by groups (with one variable)'),
      flagsOf('Identify Outliers', [['id', 'Identify outliers with the row names', false]]), ...labelFields()],
    code(v, c) {
      const one = v.ys.length === 1;
      const data = one ? (v.g ? `${c.S(v.ys[0])} ~ ${c.S(v.g)}, data = ${c.ds}` : c.dv(v.ys[0])) : c.cols(v.ys);
      const labels = labelArgs(v);
      const ylab = !labels.includes('ylab =') && one ? `, ylab = ${rs(v.ys[0])}` : '';
      return v.flags.id ? `car::Boxplot(${data}, id = list(method = "y")${ylab}${labels})` : `boxplot(${data}${ylab}${labels})`;
    } },
  QQPlot: { pkgs: ['car'], fields: [numVar('x'), groups('g'),
      { k: 'dist', type: 'choice', label: 'Distribution', choices: [['norm', 'Normal'], ['t', 't'], ['chisq', 'Chi-squared'], ['f', 'F'], ['other', 'Other']] },
      { k: 'df', type: 'num', min: 1, def: '5', label: 'df = ', when: v => v.dist === 't' || v.dist === 'chisq' || v.dist === 'f' },
      { k: 'df2', type: 'num', min: 1, def: '5', label: 'Denominator df = ', when: v => v.dist === 'f' },
      { k: 'other', type: 'text', def: 'exp', label: 'Specify:  ', pattern: /^[A-Za-z][A-Za-z0-9._]*$/, error: 'Enter the name of a distribution, e.g. exp', when: v => v.dist === 'other' },
      { k: 'params', type: 'text', optional: true, def: '', label: 'Parameters:  ', sample: 'rate = 2', when: v => v.dist === 'other' },
      identifyField, ...labelFields()],
    code(v, c) {
      const dist = v.dist === 'other' ? v.other : v.dist;
      const extra = v.dist === 't' || v.dist === 'chisq' ? `, df = ${v.df}` : v.dist === 'f' ? `, df1 = ${v.df}, df2 = ${v.df2}` : v.dist === 'other' && v.params.trim() ? `, ${v.params.trim()}` : '';
      return `car::qqPlot(${v.g ? `${c.S(v.x)} ~ ${c.S(v.g)}, data = ${c.ds}` : c.dv(v.x)}, distribution = ${rs(dist)}${extra}, id = list(n = ${v.idn}, method = "y")${labelArgs(v)})`;
    } },
  Symbox: { pkgs: ['car'], fields: [numVar('x', 'Variable (positive values)'),
      { k: 'start', type: 'text', optional: true, def: '', label: 'Start (optional)', pattern: /^\s*-?\d*\.?\d+\s*$/, error: 'Enter a number or leave blank.', sample: '0' },
      { k: 'powers', type: 'numlist', label: 'Powers', def: '-1, -0.5, 0, 0.5, 1' }],
    code: (v, c) => `car::symbox(~${c.S(v.x)}, data = ${c.ds}${v.start.trim() ? `, start = ${v.start.trim()}` : ''}, powers = c(${v.powers.join(', ')}))` },

  scatterPlot: { pkgs: ['car'],
    fields: [numVar('x', 'x-variable (pick one)'), numVar('y', 'y-variable (pick one)', { exclude: ['x'] }), groups('g'),
      flagsOf('Plot Options', [['line', 'Least-squares line', true], ['smooth', 'Smooth line', false], ['box', 'Marginal boxplots', false], ['ellipse', 'Plot concentration ellipse(s)', false]]),
      { ...spanField, when: v => v.flags.smooth }, { ...levelsField, when: v => v.flags.ellipse },
      { k: 'legend', type: 'choice', label: 'Legend Position', choices: legendChoices, when: v => Boolean(v.g) },
      identifyField, ...sizeFields, ...labelFields(['xlab', 'ylab'])],
    code: (v, c) => `car::scatterplot(${c.S(v.y)} ~ ${c.S(v.x)}${v.g ? ` | ${c.S(v.g)}` : ''}, regLine = ${rbool(v.flags.line)}, ` +
      `smooth = ${v.flags.smooth ? `list(span = ${v.span})` : 'FALSE'}, boxplots = ${v.flags.box ? '"xy"' : 'FALSE'}, ` +
      `ellipse = ${v.flags.ellipse ? `list(levels = c(${v.levels.join(', ')}))` : 'FALSE'}, id = ${id(v)}${v.g ? `, legend = list(coords = ${rs(v.legend)})` : ''}, ` +
      `cex = ${v.cex}, cex.axis = ${v.cexAxis}, cex.lab = ${v.cexLab}${labelArgs(v, ['xlab', 'ylab'])}, data = ${c.ds})` },
  scatterPlotMatrix: { pkgs: ['car'],
    fields: [numVars('xs', 'Select variables (three or more)', 3), groups('g'),
      { k: 'diag', type: 'choice', label: 'On Diagonal', choices: [['density', 'Density estimate'], ['histogram', 'Histogram'], ['boxplot', 'Boxplot'], ['qqplot', 'Normal QQ plot'], ['none', 'Nothing']] },
      flagsOf('Other Options', [['line', 'Least-squares lines', true], ['smooth', 'Smooth lines', false], ['ellipse', 'Plot concentration ellipse(s)', false]]),
      { ...spanField, when: v => v.flags.smooth }, { ...levelsField, when: v => v.flags.ellipse }, identifyField, ...labelFields(['main'])],
    code: (v, c) => `car::scatterplotMatrix(~${v.xs.map(S).join(' + ')}${v.g ? ` | ${c.S(v.g)}` : ''}, regLine = ${rbool(v.flags.line)}, ` +
      `smooth = ${v.flags.smooth ? `list(span = ${v.span})` : 'FALSE'}, ellipse = ${v.flags.ellipse ? `list(levels = c(${v.levels.join(', ')}))` : 'FALSE'}, ` +
      `id = ${id(v)}, diagonal = list(method = ${rs(v.diag)})${labelArgs(v, ['main'])}, data = ${c.ds})` },
  linePlot: { fields: [numVar('x', 'x variable (pick one)'), numVars('ys', 'y variables (pick one or more)', 1, { exclude: ['x'] })],
    code: (v, c) => lines(`.ord <- order(${c.dv(v.x)})`,
      `matplot(${c.dv(v.x)}[.ord], ${c.cols(v.ys)}[.ord, , drop = FALSE], type = "b", pch = 1:${v.ys.length}, lty = 1, xlab = ${rs(v.x)}, ylab = ${rs(v.ys.join(', '))})`,
      v.ys.length > 1 && `legend("topright", legend = ${rc(v.ys)}, pch = 1:${v.ys.length}, col = 1:${v.ys.length}, lty = 1)`, 'rm(.ord)') },
  Xyplot: { fields: [numVars('xs', 'Explanatory variables (pick one or more)'), numVars('ys', 'Response variables (pick one or more)', 1, { exclude: ['xs'] }),
      { k: 'cond', type: 'var', kind: 'factor', multi: true, min: 0, label: "Conditions '|' (pick zero or more)" },
      { k: 'grp', type: 'var', kind: 'factor', multi: true, min: 0, label: "Groups 'groups=' (pick zero or more)" },
      flagsOf('Plot Type (one or both)', [['points', 'Points', true], ['lines', 'Lines', false], ['reg', 'Add a least-squares line', true]]),
      { k: 'xs_rel', type: 'choice', label: 'X-Axis Scales in Different Panels', choices: [['same', 'Identical'], ['free', 'Free'], ['sliced', 'Sliced']] },
      { k: 'ys_rel', type: 'choice', label: 'Y-Axis Scales in Different Panels', choices: [['same', 'Identical'], ['free', 'Free'], ['sliced', 'Sliced']] },
      { k: 'cols', type: 'text', optional: true, def: '<auto>', label: 'number of columns: ', pattern: /^(<auto>|\s*\d+\s*)$/, error: 'Enter a whole number or <auto>', sample: '2' },
      { k: 'rows', type: 'text', optional: true, def: '<auto>', label: 'number of rows: ', pattern: /^(<auto>|\s*\d+\s*)$/, error: 'Enter a whole number or <auto>', sample: '2' },
      ...labelFields()],
    code(v, c) {
      const type = [v.flags.points && '"p"', v.flags.lines && '"l"', v.flags.reg && '"r"'].filter(Boolean);
      const both = given(v.cols) && given(v.rows);
      const inter = names => names.length > 1 ? `interaction(${names.map(S).join(', ')})` : S(names[0]);
      return `print(lattice::xyplot(${v.ys.map(S).join(' + ')} ~ ${v.xs.map(S).join(' + ')}${v.cond.length ? ` | ${v.cond.map(S).join(' + ')}` : ''}, ` +
        `type = c(${type.join(', ') || '"p"'}), data = ${c.ds}${v.grp.length ? `, groups = ${inter(v.grp)}, auto.key = list(space = "right")` : ''}, ` +
        `scales = list(x = list(relation = ${rs(v.xs_rel)}), y = list(relation = ${rs(v.ys_rel)}))${both ? `, layout = c(${v.cols.trim()}, ${v.rows.trim()})` : ''}${labelArgs(v)}))`;
    } },
  PlotMeans: { pkgs: ['RcmdrMisc'], fields: [factor('a', 'Factors (pick one or two)'), factor('b', 'Factor 2 (optional)', { optional: true, exclude: ['a'] }), numVar('y', 'Response Variable (pick one)'),
      { k: 'err', type: 'choice', label: 'Error Bars', choices: [['se', 'Standard errors'], ['sd', 'Standard deviations'], ['conf.int', 'Confidence intervals'], ['none', 'No error bars']] },
      { k: 'level', type: 'num', min: 0.0001, max: 0.9999, def: '0.95', label: 'Level of confidence: ', when: v => v.err === 'conf.int' },
      { k: 'legend', type: 'choice', label: 'Position of Legend', choices: [['farright', 'farright'], ...['bottomright', 'bottom', 'bottomleft', 'left', 'topleft', 'top', 'topright', 'right', 'center'].map(p => [p, p])], when: v => Boolean(v.b) },
      flagsOf('Options', [['connect', 'Connect profiles of means', true]]), ...labelFields()],
    code: (v, c) => `RcmdrMisc::plotMeans(${c.dv(v.y)}, ${c.dv(v.a)}, ${v.b ? `${c.dv(v.b)}, ` : ''}error.bars = ${rs(v.err)}${v.err === 'conf.int' ? `, level = ${v.level}` : ''}` +
      `${v.b ? `, legend.pos = ${rs(v.legend)}` : ''}, connect = ${rbool(v.flags.connect)}${labelArgs(v)})` },
  stripChart: { fields: [{ k: 'gs', type: 'var', kind: 'factor', multi: true, min: 0, label: 'Factors (pick zero or more)' }, numVar('y', 'Response Variable (pick one)'),
      { k: 'method', type: 'choice', label: 'Duplicate Values', choices: [['overplot', 'Overplot'], ['jitter', 'Jitter'], ['stack', 'Stack']] }, ...labelFields()],
    code(v, c) {
      const rhs = v.gs.length > 1 ? `interaction(${v.gs.map(S).join(', ')})` : v.gs.length ? S(v.gs[0]) : '';
      return `stripchart(${rhs ? `${c.S(v.y)} ~ ${rhs}, data = ${c.ds}` : c.dv(v.y)}, vertical = TRUE, method = ${rs(v.method)}${labelArgs(v)}${given(v.ylab) ? '' : `, ylab = ${rs(v.y)}`})`;
    } },

  barGraph: { pkgs: ['RcmdrMisc'], fields: [factor('f', 'Variable (pick one)'), factor('g', 'Plot by groups', { optional: true, exclude: ['f'] }),
      { k: 'style', type: 'choice', label: 'Style of Group Bars', choices: [['parallel', 'Side by side'], ['divided', 'Stacked']], when: v => Boolean(v.g) },
      { k: 'conditional', type: 'choice', label: 'Percentages for Group Bars', choices: [['TRUE', 'Percent within each group'], ['FALSE', 'Percent of all observations']], when: v => Boolean(v.g) },
      { k: 'scale', type: 'choice', label: 'Axis Scaling', choices: [['frequency', 'Frequency counts'], ['percent', 'Percentages']] },
      { k: 'legend', type: 'choice', label: 'Position of Legend', choices: [['above', 'above'], ...legendChoices], when: v => Boolean(v.g) },
      flagsOf('Show counts or percentages in bars', [['label', 'Show counts or percentages in bars', false]]), ...labelFields()],
    code: (v, c) => `RcmdrMisc::Barplot(${c.dv(v.f)}, ${v.g ? `by = ${c.dv(v.g)}, style = ${rs(v.style)}, conditional = ${v.conditional}, legend.pos = ${rs(v.legend)}, ` : ''}scale = ${rs(v.scale)}, label.bars = ${rbool(v.flags.label)}, ` +
      `xlab = ${rs(given(v.xlab) ? v.xlab.trim() : v.f)}, ylab = ${rs(given(v.ylab) ? v.ylab.trim() : v.scale === 'percent' ? 'Percent' : 'Frequency')}${labelArgs(v, ['main'])})` },
  pieChart: { pkgs: ['colorspace'], fields: [factor('f', 'Variable (pick one)'),
      flagsOf('Include in Segment Labels', [['counts', 'Counts', false], ['percents', 'Percentages', false]]), colorField, ...labelFields()],
    code: (v, c) => lines('local({', `  .Table <- table(${c.dv(v.f)})`,
      `  .labels <- paste0(names(.Table)${v.flags.counts ? ', " (", .Table, ")"' : ''}${v.flags.percents ? ', " ", round(100 * .Table / sum(.Table), 1), "%"' : ''})`,
      `  pie(.Table, labels = .labels, xlab = ${rs(given(v.xlab) ? v.xlab.trim() : '')}, ylab = ${rs(given(v.ylab) ? v.ylab.trim() : '')}, main = ${rs(given(v.main) ? v.main.trim() : v.f)}, col = ${COLORS[v.colors]('length(.Table)')})`, '})') },

  Scatter3D: { pkgs: ['rgl', 'car'], fields: [numVar('x', 'Explanatory variables (pick two): first'), numVar('z', 'second', { exclude: ['x'] }), numVar('y', 'Response variable (pick one)', { exclude: ['x', 'z'] }), groups('g'),
      { k: 'fit', type: 'choice', label: 'Surfaces to Fit', choices: [['linear', 'Linear least-squares'], ['quadratic', 'Quadratic least-squares'], ['smooth', 'Smooth regression'], ['additive', 'Additive regression']] },
      flagsOf('Options', [['axes', 'Show axis scales', true], ['grid', 'Show surface grid lines', true], ['resid', 'Show residuals', true], ['squares', 'Show squared residuals', false], ['ellipsoid', 'Plot 50% concentration ellipsoid', false], ['parallel', 'Parallel regression surfaces', false]]),
      { k: 'bg', type: 'choice', label: 'Background Color', choices: [['white', 'White'], ['black', 'Black']] }],
    code: (v, c) => `car::scatter3d(${c.S(v.y)} ~ ${c.S(v.x)} + ${c.S(v.z)}${v.g ? ` | ${c.S(v.g)}` : ''}, data = ${c.ds}, fit = ${rs(v.fit)}, residuals = ${rbool(v.flags.resid)}, ` +
      `squares = ${rbool(v.flags.squares)}, bg = ${rs(v.bg)}, axis.scales = ${rbool(v.flags.axes)}, grid = ${rbool(v.flags.grid)}, ellipsoid = ${rbool(v.flags.ellipsoid)}, ` +
      `surface.col = ${v.g ? 'carPalette()[-1]' : '"darkblue"'}${v.g ? `, parallel = ${rbool(v.flags.parallel)}` : ''})` },
  saveBitmap: { ds: false, fields: [{ k: 'type', type: 'choice', label: 'Graphics File Type', choices: [['png', 'PNG'], ['jpeg', 'JPEG'], ['bmp', 'BMP'], ['tiff', 'TIFF']] },
      { ...fileType, filters: { 'Bitmap': ['png', 'jpg', 'jpeg', 'bmp', 'tiff'] }, def: 'graph.png' },
      { k: 'units', type: 'choice', label: 'Units', choices: [['px', 'Pixels'], ['in', 'Inches'], ['cm', 'Centimeters'], ['mm', 'Millimeters']] },
      { k: 'w', type: 'num', min: 0.1, def: '500', label: 'Width' }, { k: 'h', type: 'num', min: 0.1, def: '500', label: 'Height' },
      { k: 'pointsize', type: 'num', min: 1, def: '12', label: 'Text size (points)' }],
    code: v => lines(`dev.copy(${v.type}, filename = ${rs(v.file)}, width = ${v.w}, height = ${v.h}, units = ${rs(v.units)}${v.units === 'px' ? '' : ', res = 300'}, pointsize = ${v.pointsize})`, 'invisible(dev.off())') },
  savePDF: { ds: false, fields: [{ k: 'type', type: 'choice', label: 'Graphics File Type', choices: [['pdf', 'PDF'], ['postscript', 'PostScript'], ['eps', 'Encapsulated PostScript']] },
      { ...fileType, filters: { 'Vector graphics': ['pdf', 'ps', 'eps'] }, def: 'graph.pdf' },
      { k: 'w', type: 'num', min: 1, def: '7', label: 'Width in inches' }, { k: 'h', type: 'num', min: 1, def: '7', label: 'Height in inches' },
      { k: 'pointsize', type: 'num', min: 1, def: '12', label: 'Text size (points)' }],
    // Plain device copies work from any graphics device, including the VS Code plot viewer.
    code: v => lines(v.type === 'eps'
      ? `dev.copy(postscript, file = ${rs(v.file)}, onefile = FALSE, horizontal = FALSE, paper = "special", width = ${v.w}, height = ${v.h}, pointsize = ${v.pointsize})`
      : `dev.copy(${v.type}, file = ${rs(v.file)}, width = ${v.w}, height = ${v.h}, pointsize = ${v.pointsize})`, 'invisible(dev.off())') },
  saveRglGraph: { ds: false, pkgs: ['rgl'], fields: [{ ...fileType, filters: { 'PNG image': ['png'] }, def: 'graph3d.png' }],
    code: v => `rgl::rgl.snapshot(${rs(v.file)})` }
};

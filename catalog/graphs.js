// (no helpers needed from rhelpers: the code is written as Rcmdr writes it)

// The Graphs menu, dialog by dialog as in Rcmdr: same fields, labels, defaults and generated code.
const lines = (...parts) => parts.flat().filter(x => x !== false && x !== undefined && x !== null && x !== '').join('\n');
const check = (k, text, on = false, extra = {}) => ({ k, type: 'flags', label: '', items: [[k, text, on]], ...extra });
const choice = (k, label, choices, def, extra = {}) => ({ k, type: 'choice', label, choices, ...(def !== undefined && { def }), ...extra });
const groupsBox = (label = 'Plot by groups', kind = 'factor') => ({ k: 'g', type: 'var', kind, optional: true, label });
const AUTO = '<auto>';
// "Plot Labels": x-axis label, y-axis label and graph title, <auto> leaves R's own.
const labelField = (k, label) => ({ k, type: 'text', optional: true, def: AUTO, label, sample: { xlab: 'Etiqueta x', ylab: 'Etiqueta y', main: 'Título' }[k] });
const plotLabels = (keys = ['xlab', 'ylab', 'main']) => keys.map(k => labelField(k, { xlab: 'x-axis label', ylab: 'y-axis label', main: 'Graph title' }[k]));
const given = text => text !== undefined && text.trim() !== '' && text.trim() !== AUTO;
const labelArg = (v, k) => (given(v[k]) ? `, ${k}="${v[k].trim()}"` : '');
const labelArgs = (v, keys = ['xlab', 'ylab', 'main']) => keys.map(k => labelArg(v, k)).join('');
// Identifying points with the mouse needs a window that takes clicks, so R's own X11 window opens first
// (the VS Code plot viewer cannot report mouse clicks).
const MOUSE = ['mouse', 'Interactively with mouse'];
const withWindow = (v, code) => (v.identify === 'mouse' || v.identify === 'identify' ? `x11(type="cairo")\n${code}` : code);
const identify = choice('identify', 'Identify Points', [['auto', 'Automatically'], MOUSE, ['not', 'Do not identify']]);
const idn = (label = 'Number of points to identify  ', def = '2') => ({ k: 'idn', type: 'num', int: true, min: 0, def, label });
const subsetField = { k: 'subset', type: 'text', optional: true, def: '<all valid cases>', label: 'Subset expression', sample: 'n1 > 0.5' };
const subsetArg = v => (v.subset && v.subset.trim() && v.subset.trim() !== '<all valid cases>' ? `, subset=${v.subset.trim()}` : '');
const levelsVector = text => `c(${text.replace(/,/g, ' ').trim().split(/[ ]+/).join(', ')})`;
const fileFilters = { png: { 'PNG Files': ['png', 'PNG'] }, jpeg: { 'JPEG Files': ['jpg', 'JPG', 'jpeg', 'JPEG'] },
  pdf: { 'PDF Files': ['pdf', 'PDF'] }, postscript: { 'Postscript Files': ['ps', 'PS'] }, eps: { 'Encapsulated Postscript Files': ['eps', 'EPS'] } };
const saveTo = async (ui, type, ext) => ui.file({ mode: 'save', filters: { ...fileFilters[type], 'All Files': ['*'] }, def: `RGraph.${ext}` }, ui.t('Save the graph as'));
const PALETTE = ['#000000', '#DF536B', '#61D04F', '#2297E6', '#28E2E5', '#CD0BBC', '#F5C710', '#9E9E9E'];

module.exports = {
  // Rcmdr shows the eight colours of the palette, each one editable.
  setPalette: { ds: false,
    fields: PALETTE.map((hex, i) => ({ k: `hex${i + 1}`, type: 'text', label: '', prompt: `${i + 1}`, def: hex, compact: true,
      pattern: /^(#[0-9A-Fa-f]{6}|[A-Za-z]+[0-9]*)$/, error: 'Enter a colour, e.g. #DF536B or red' })),
    code: v => `palette(c(${PALETTE.map((_, i) => `"${v[`hex${i + 1}`].trim()}"`).join(', ')}))` },

  indexPlot: {
    fields: [{ k: 'xs', type: 'var', kind: 'numeric', multi: true, label: 'Variable (pick one or more)' }, groupsBox('Mark by groups'),
      choice('type', 'Style of plot', [['h', 'Spikes'], ['p', 'Points']]), identify, idn(), ...plotLabels(['ylab', 'main'])],
    code(v, c) {
      const x = v.xs.length === 1 ? `'${v.xs[0]}'` : `c(${v.xs.map(n => `'${n}'`).join(', ')})`;
      const id = v.identify === 'mouse' ? "id.method='identify'" : `id.method='y', id.n=${v.identify === 'not' ? 0 : v.idn}`;
      return withWindow(v, `indexplot(${c.ds}[,${x}, drop=FALSE], type='${v.type}', ${id}${labelArgs(v, ['ylab', 'main'])}${v.g ? `, groups=${c.ds}$${v.g}` : ''})`);
    } },
  DotPlot: {
    fields: [{ k: 'x', type: 'var', kind: 'numeric', label: 'Variable (pick one)' }, groupsBox(),
      check('bin', 'Bin variable'), { k: 'bins', type: 'text', label: 'Number of bins: ', def: AUTO, compact: true, when: v => v.bin.bin }, ...plotLabels(['xlab'])],
    code(v, c) {
      const breaks = v.bin.bin ? `, breaks=${v.bins.trim() === AUTO ? '"Sturges"' : Number(v.bins)}` : '';
      return `with(${c.ds}, Dotplot(${v.x}${v.g ? `, by=${v.g}` : ''}, bin=${v.bin.bin ? 'TRUE' : 'FALSE'}${breaks}${labelArg(v, 'xlab')}))`;
    } },
  Histogram: {
    fields: [{ k: 'x', type: 'var', kind: 'numeric', label: 'Variable (pick one)' }, groupsBox(),
      { k: 'bins', type: 'text', label: 'Number of bins: ', def: AUTO, pattern: /^(<auto>|\s*\d+\s*)$/, error: 'Enter a whole number or <auto>' },
      choice('scale', 'Axis Scaling', [['frequency', 'Frequency counts'], ['percent', 'Percentages'], ['density', 'Densities']]), ...plotLabels()],
    code: (v, c) => `with(${c.ds}, Hist(${v.x}${v.g ? `, groups=${v.g}` : ''}, scale="${v.scale}", breaks=${v.bins.trim() === AUTO ? '"Sturges"' : v.bins.trim()}, col="darkgray"${labelArgs(v)}))` },
  DiscretePlot: {
    fields: [{ k: 'x', type: 'var', kind: 'discrete', label: 'Variable (pick one)' }, groupsBox(),
      choice('scale', 'Axis Scaling', [['frequency', 'Frequency counts'], ['percent', 'Percentages']]), ...plotLabels()],
    code: (v, c) => `with(${c.ds}, discretePlot(${v.x}${v.g ? `, by=${v.g}` : ''}, scale="${v.scale}"${labelArgs(v)}))` },
  DensityPlot: {
    fields: [{ k: 'x', type: 'var', kind: 'numeric', label: 'Variable (pick one)' }, groupsBox(),
      choice('kernel', '', [['gaussian', 'Gaussian'], ['epanechnikov', 'Epanechnikov'], ['biweight', 'Tukey biweight']], undefined, { prompt: 'Kernel Function' }),
      choice('method', 'Method', [['adaptive', 'adaptive kernel'], ['kernel', 'kernel']]),
      { k: 'bw', type: 'text', label: 'Bandwidth', def: AUTO, pattern: /^(<auto>|\s*\d*\.?\d+\s*)$/, error: 'Bandwidth must be <auto> or a positive number' },
      { k: 'adjust', type: 'num', min: 0.1, max: 10, def: '1', label: 'Multiply bandwidth by' },
      { k: 'from', type: 'text', label: 'From', def: AUTO, compact: true }, { k: 'to', type: 'text', label: 'To', def: AUTO, compact: true },
      ...plotLabels(['xlab', 'ylab'])],
    code(v, c) {
      const bw = v.bw.trim() === AUTO ? (v.method === 'adaptive' ? 'bw.SJ' : '"SJ"') : v.bw.trim();
      const kernel = v.method === 'adaptive' ? { gaussian: 'dnorm', epanechnikov: 'depan', biweight: 'dbiwt' }[v.kernel] : `"${v.kernel}"`;
      // As Rcmdr: "To" is used only when "From" is given.
      const range = v.from.trim() === AUTO ? '' : `, from=${v.from.trim()}, to=${v.to.trim()}`;
      return `densityPlot(${v.g ? `${v.x}~${v.g}` : `~ ${v.x}`}, data=${c.ds}, bw=${bw}, adjust=${v.adjust}, kernel=${kernel}, method="${v.method}"${range}${labelArgs(v, ['xlab', 'ylab'])})`;
    } },
  stemAndLeaf: { pkgs: ['aplpack'],
    fields: [{ k: 'x', type: 'var', kind: 'numeric', label: 'Variable (pick one)' }, groupsBox('Plot back-to-back by', 'twolevel'),
      check('auto', 'Automatic', true, { prompt: 'Leafs Digit:  ' }),
      { k: 'unit', type: 'num', int: true, min: -6, max: 6, def: '0', label: 'Leafs Digit:  ', when: v => !v.auto.auto },
      choice('m', 'Parts Per Stem', [['auto', 'Automatic'], ['1', '   1'], ['2', '   2'], ['5', '   5']]),
      choice('style', 'Style of Divided Stems', [['Tukey', 'Tukey'], ['bare', 'Repeated stem digits']]),
      { k: 'opts', type: 'flags', label: 'Other Options', items: [['trim', 'Trim outliers', true], ['depths', 'Show depths', true], ['reverse', 'Reverse negative leaves', true]] }],
    code(v, c) {
      const opts = `${v.style === 'Tukey' ? '' : ', style="bare"'}${v.auto.auto ? '' : `, unit=${10 ** Number(v.unit)}`}${v.m === 'auto' ? '' : `, m=${v.m}`}` +
        `${v.opts.trim ? '' : ', trim.outliers=FALSE'}${v.opts.depths ? '' : ', depths=FALSE'}${v.opts.reverse ? '' : ', reverse.negative.leaves=FALSE'}, na.rm=TRUE`;
      if (!v.g) return `library(aplpack)\nwith(${c.ds}, stem.leaf(${v.x}${opts}))`;
      return `library(aplpack)\nwith(${c.ds}, stem.leaf.backback(${v.x}[${v.g} == "${v.levels[0]}"], ${v.x}[${v.g} == "${v.levels[1]}"]${opts}))`;
    },
    async after(v, ui) { v.levels = v.g ? await ui.query(`levels(as.factor(${ui.ctx.ds}$${v.g}))`) || [] : []; return true; } },
  boxPlot: {
    fields: [{ k: 'ys', type: 'var', kind: 'numeric', multi: true, label: 'Variable (pick one or more)' }, groupsBox(),
      choice('identify', 'Identify Outliers', [['y', 'Automatically'], ['identify', 'Interactively with mouse'], ['none', 'No']]), ...plotLabels()],
    check: v => (v.g && v.ys.length > 1 ? 'You cannot plot by groups with more than one variable selected' : undefined),
    code: (v, c) => withWindow(v, v.g ? `Boxplot(${v.ys[0]} ~ ${v.g}, data=${c.ds}, id=list(method="${v.identify}")${labelArgs(v)})`
      : `Boxplot( ~ ${v.ys.join(' + ')}, data=${c.ds}, id=list(method="${v.identify}")${labelArgs(v, ['ylab', 'main'])})`) },
  QQPlot: {
    fields: [{ k: 'x', type: 'var', kind: 'numeric', label: 'Variable (pick one)' }, groupsBox(),
      choice('dist', 'Distribution', [['norm', 'Normal'], ['t', 't'], ['chisq', 'Chi-square'], ['f', 'F'], ['other', 'Other']]),
      { k: 'df', type: 'text', label: 'df = ', def: '', compact: true, when: v => v.dist === 't' },
      { k: 'chisqdf', type: 'text', label: 'df = ', def: '', compact: true, when: v => v.dist === 'chisq' },
      { k: 'fdf1', type: 'text', label: 'Numerator df = ', def: '', compact: true, when: v => v.dist === 'f' },
      { k: 'fdf2', type: 'text', label: 'Denominator df = ', def: '', compact: true, when: v => v.dist === 'f' },
      { k: 'othername', type: 'text', label: 'Specify: ', def: '', compact: true, when: v => v.dist === 'other' },
      { k: 'otherparam', type: 'text', label: 'Parameters: ', def: '', when: v => v.dist === 'other' },
      identify, idn(), ...plotLabels()],
    check(v) {
      const num = s => /^\s*\d*\.?\d+\s*$/.test(s || '');
      if (v.dist === 't' && !num(v.df)) return 'You must specify the degrees of freedom.';
      if (v.dist === 'chisq' && !num(v.chisqdf)) return 'You must specify the degrees of freedom.';
      if (v.dist === 'f' && (!num(v.fdf1) || !num(v.fdf2))) return 'You must specify the degrees of freedom.';
      if (v.dist === 'other' && (!v.othername.trim() || !v.otherparam.trim())) return 'You must specify the distribution name and parameters.';
      return undefined;
    },
    code(v, c) {
      const args = v.dist === 'norm' ? 'dist="norm"' : v.dist === 't' ? `dist="t", df=${v.df}` : v.dist === 'chisq' ? `dist="chisq", df=${v.chisqdf}`
        : v.dist === 'f' ? `dist="f", df1=${v.fdf1}, df2=${v.fdf2}` : `dist="${v.othername.trim()}", ${v.otherparam.trim()}`;
      const id = v.identify === 'mouse' ? 'method="identify"' : `method="y", n=${v.identify === 'not' ? 0 : v.idn}`;
      return withWindow(v, `with(${c.ds}, qqPlot(${v.x}, ${args}, id=list(${id}, labels=rownames(${c.ds}))${labelArgs(v)}${v.g ? `, groups=${v.g}` : ''}))`);
    } },
  Symbox: {
    fields: [{ k: 'x', type: 'var', kind: 'numeric', label: 'Variable (pick one)' },
      choice('family', 'Transformation Family', [['bcPower', 'Box-Cox'], ['bcnPower', 'Box-Cox with negatives'], ['yjPower', 'Yeo-Johnson']]),
      { k: 'start', type: 'text', optional: true, def: '', label: 'Start (optional)', pattern: /^\s*-?\d*\.?\d+\s*$/, error: 'Enter a number or leave blank.' },
      { k: 'powers', type: 'text', label: 'Powers', def: '-1, -0.5, 0, 0.5, 1' }],
    code(v, c) {
      const powers = `c(${v.powers.replace(/ /g, ',').replace(/,+/g, ',')})`;
      return `symbox(~ ${v.x}, data=${c.ds}, trans=${v.family}, powers=${powers}${v.start.trim() ? `, start=${v.start.trim()}` : ''})`;
    } },

  scatterPlot: {
    fields: [{ k: 'x', type: 'var', kind: 'numeric', label: 'x-variable (pick one)' }, { k: 'y', type: 'var', kind: 'numeric', exclude: ['x'], label: 'y-variable (pick one)' },
      groupsBox(), check('byGroup', 'Plot lines by group', true, { when: v => Boolean(v.g) }), subsetField,
      { k: 'opts', type: 'flags', label: 'Plot Options', items: [['jitterX', 'Jitter x-variable', false], ['jitterY', 'Jitter y-variable', false], ['logX', 'Log x-axis', false],
        ['logY', 'Log y-axis', false], ['boxplots', 'Marginal boxplots', false], ['lsLine', 'Least-squares line', false], ['smoothLine', 'Smooth line', false], ['spread', 'Show spread', false]] },
      { k: 'span', type: 'num', int: true, min: 5, max: 100, def: '50', label: 'Span for smooth' },
      check('ellipse', 'Plot concentration ellipse(s)'), { k: 'levels', type: 'text', label: 'Concentration levels: ', def: '.5, .9' },
      choice('identify', 'Identify Points', [['auto', 'Automatically'], MOUSE, ['not', 'Do not identify']], 'not'), idn(),
      ...plotLabels(), { k: 'pch', type: 'text', label: 'Plotting characters', def: AUTO },
      { k: 'cex', type: 'num', min: 0.5, max: 2.5, def: '1', label: 'Point size' }, { k: 'cexAxis', type: 'num', min: 0.5, max: 2.5, def: '1', label: 'Axis text size' },
      { k: 'cexLab', type: 'num', min: 0.5, max: 2.5, def: '1', label: 'Axis-labels text size' },
      choice('legend', 'Legend Position', [['above', 'Above plot'], ['topleft', 'Top left'], ['topright', 'Top right'], ['bottomleft', 'Bottom left'], ['bottomright', 'Bottom right']], undefined, { when: v => Boolean(v.g) })],
    code(v, c) {
      const o = v.opts;
      const jitter = o.jitterX && o.jitterY ? ', jitter=list(x=1, y=1)' : o.jitterX ? ', jitter=list(x=1)' : o.jitterY ? ', jitter=list(y=1)' : '';
      const log = `${o.logX ? 'x' : ''}${o.logY ? 'y' : ''}`;
      const smooth = o.smoothLine ? `, smooth=list(span=${Number(v.span) / 100}, spread=${o.spread ? 'TRUE' : 'FALSE'})` : ', smooth=FALSE';
      const id = v.identify === 'auto' ? `, id=list(method='mahal', n=${v.idn})` : v.identify === 'mouse' ? ", id=list(method='identify')" : '';
      const ellipse = v.ellipse.ellipse ? `, ellipse=list(levels=${levelsVector(v.levels)})` : '';
      const cex = ['cex', 'cexAxis', 'cexLab'].map((k, i) => (Number(v[k]) === 1 ? '' : `, ${['cex', 'cex.axis', 'cex.lab'][i]}=${v[k]}`)).join('');
      const pch = v.pch.trim() === AUTO ? '' : `, pch=c(${v.pch.replace(/ /g, ',')})`;
      const groups = v.g ? `, by.groups=${v.byGroup.byGroup ? 'TRUE' : 'FALSE'}${v.legend !== 'above' ? `, legend=list(coords="${v.legend}")` : ''}` : '';
      return withWindow(v, `scatterplot(${v.y}~${v.x}${v.g ? ` | ${v.g}` : ''}${log ? `, log="${log}"` : ''}, regLine=${o.lsLine ? 'TRUE' : 'FALSE'}${smooth}${id}, boxplots=${o.boxplots ? "'xy'" : 'FALSE'}` +
        `${ellipse}${jitter}${labelArgs(v)}${cex}${pch}${groups}, data=${c.ds}${subsetArg(v)})`);
    } },
  scatterPlotMatrix: {
    fields: [{ k: 'xs', type: 'var', kind: 'numeric', multi: true, min: 3, label: 'Select variables (three or more)' },
      groupsBox(), check('byGroup', 'Plot lines by group', true, { when: v => Boolean(v.g) }), subsetField,
      { k: 'opts', type: 'flags', label: 'Other Options', items: [['lsLine', 'Least-squares lines', false], ['smoothLine', 'Smooth lines', false], ['spread', 'Show spread', false]] },
      { k: 'span', type: 'num', int: true, min: 5, max: 100, def: '50', label: 'Span for smooth' },
      check('ellipse', 'Plot concentration ellipse(s)'), { k: 'levels', type: 'text', label: 'Concentration levels: ', def: '.5, .9' },
      idn('Number of points to identify  \nin each panel and group ', '0'),
      choice('diag', 'On Diagonal', [['density', 'Density plots'], ['histogram', 'Histograms'], ['boxplot', 'Boxplots'], ['oned', 'One-dimensional scatterplots'], ['qqplot', 'Normal QQ plots'], ['none', 'Nothing (empty)']]),
      ...plotLabels(['main'])],
    code(v, c) {
      const o = v.opts;
      const smooth = o.smoothLine ? `, smooth=list(span=${Number(v.span) / 100}, spread=${o.spread ? 'TRUE' : 'FALSE'})` : ', smooth=FALSE';
      const ellipse = v.ellipse.ellipse ? `, ellipse=list(levels=${levelsVector(v.levels)})` : '';
      const id = Number(v.idn) !== 0 ? `, id=list(method="mahal", n=${v.idn})` : '';
      return `scatterplotMatrix(~${v.xs.join('+')}${v.g ? ` | ${v.g}, \n                       ` : ', '}regLine=${o.lsLine ? 'TRUE' : 'FALSE'}${smooth}${ellipse}${id}, ` +
        `diagonal=list(method="${v.diag}")${v.g ? `, by.groups=${v.byGroup.byGroup ? 'TRUE' : 'FALSE'}` : ''}, data=${c.ds}${subsetArg(v)}${labelArg(v, 'main')})`;
    } },
  linePlot: {
    fields: [{ k: 'x', type: 'var', kind: 'numeric', label: 'x variable (pick one)' }, { k: 'ys', type: 'var', kind: 'numeric', multi: true, exclude: ['x'], label: 'y variables (pick one or more)' }],
    code: (v, c) => `with(${c.ds}, lineplot(${v.x}, ${v.ys.join(', ')}))` },
  Xyplot: {
    fields: [{ k: 'xs', type: 'var', kind: 'numeric', multi: true, label: 'Explanatory variables (pick one or more)' },
      { k: 'ys', type: 'var', kind: 'numeric', multi: true, exclude: ['xs'], label: 'Response variables (pick one or more)' },
      { k: 'cond', type: 'var', kind: 'factor', multi: true, min: 0, label: "Conditions '|' (pick zero or more)" },
      { k: 'grp', type: 'var', kind: 'factor', multi: true, min: 0, exclude: ['cond'], label: "Groups 'groups=' (pick zero or more)" },
      { k: 'opts', type: 'flags', label: 'Other Options', items: [['auto.key', 'Automatically draw key', true], ['outer', 'Different panels for different y ~ x combinations', false]] },
      { k: 'type', type: 'flags', label: 'Plot Type (one or both)', items: [['points', 'Points', true], ['lines', 'Lines', false]] },
      choice('xrel', 'X-Axis Scales in Different Panels', [['same', 'Identical'], ['free', 'Free'], ['sliced', 'Same range']]),
      choice('yrel', 'Y-Axis Scales in Different Panels', [['same', 'Identical'], ['free', 'Free'], ['sliced', 'Same range']]),
      { k: 'cols', type: 'text', optional: true, def: '', label: 'number of columns:', compact: true, pattern: /^\s*\d*\s*$/, error: 'Enter a whole number or leave blank.' },
      { k: 'rows', type: 'text', optional: true, def: '', label: 'number of rows:', compact: true, pattern: /^\s*\d*\s*$/, error: 'Enter a whole number or leave blank.' },
      ...plotLabels()],
    check: v => (!v.type.points && !v.type.lines ? 'Choose at least one of points or lines.' : undefined),
    async after(v, ui) {
      v.condLevels = 1;
      for (const g of v.cond) v.condLevels *= Number((await ui.query(`nlevels(as.factor(${ui.ctx.ds}$${g}))`))?.[0] || 1);
      return true;
    },
    code(v, c) {
      const layout = v.cols.trim() && v.rows.trim() ? `c(${Number(v.cols)}, ${Number(v.rows)})` : '';
      const outer = v.opts.outer;
      let conditions = '';
      if (!v.cond.length) conditions = outer ? (layout ? `, layout=${layout}` : `, layout=c( ${v.xs.length} , ${v.ys.length} )`) : layout ? `, layout=${layout}` : '';
      else if (outer) {
        const n = v.condLevels * v.xs.length - 1;
        const between = Array.from({ length: n }, (_, i) => ((i + 1) % v.condLevels === 0 ? 1 : 0)).join(',');
        conditions = layout ? `, layout=${layout}` : `, layout=c( ${v.condLevels} * ${v.xs.length} , ${v.ys.length} ), between=list(x=c(${between}), y=1)`;
      } else if (layout) conditions = `, layout=${layout}`;
      const groups = !v.grp.length ? '' : v.grp.length === 1 ? `, groups=${v.grp[0]}` : `, groups=interaction(${v.grp.join(',')})`;
      const type = [v.type.points && '"p"', v.type.lines && '"l"'].filter(Boolean);
      return lines('library(lattice)', `xyplot(${v.ys.join(' + ')} ~ ${v.xs.join(' + ')}${v.cond.length ? ` | ${v.cond.join(' + ')}` : ''}${outer ? ', outer=TRUE' : ''}${conditions}${groups}` +
        `, type=${type.length > 1 ? `c(${type.join(', ')})` : type[0]}, pch=16${v.opts['auto.key'] ? ', auto.key=list(border=TRUE), par.settings=simpleTheme(pch=16)' : ''}` +
        `, scales=list(x=list(relation='${v.xrel}'), y=list(relation='${v.yrel}')), data=${c.ds}${labelArgs(v)})`);
    } },
  PlotMeans: {
    fields: [{ k: 'gs', type: 'var', kind: 'factor', multi: true, max: 2, label: 'Factors (pick one or two)' },
      { k: 'y', type: 'var', kind: 'numeric', label: 'Response Variable (pick one)' },
      choice('err', 'Error Bars', [['se', 'Standard errors'], ['sd', 'Standard deviations'], ['conf.int', 'Confidence intervals'], ['none', 'No error bars']]),
      { k: 'level', type: 'num', min: 0.0001, max: 0.9999, def: '0.95', label: '   Level of confidence:', when: v => v.err === 'conf.int' },
      check('connect', 'Connect profiles of means', true),
      choice('legend', 'Position of Legend', [['farright', 'To right of graph'], ['topleft', 'Top left'], ['top', 'Top center'], ['topright', 'Top right']]),
      ...plotLabels()],
    async after(v, ui) {
      if (v.gs.length === 2) {
        const n = await ui.query(`c(nlevels(as.factor(${ui.ctx.ds}$${v.gs[0]})), nlevels(as.factor(${ui.ctx.ds}$${v.gs[1]})))`);
        // As Rcmdr: the factor with more levels goes on the horizontal axis.
        if (n && Number(n[0]) < Number(n[1])) v.gs = [v.gs[1], v.gs[0]];
      }
      return true;
    },
    code(v, c) {
      const level = v.err === 'conf.int' ? `, level=${v.level}` : '';
      const common = `error.bars="${v.err}"${level}${labelArgs(v)}, connect=${v.connect.connect ? 'TRUE' : 'FALSE'}`;
      return v.gs.length === 1 ? `with(${c.ds}, plotMeans(${v.y}, ${v.gs[0]}, ${common}))`
        : `with(${c.ds}, plotMeans(${v.y}, ${v.gs[0]}, ${v.gs[1]}, ${common}, legend.pos="${v.legend}"))`;
    } },
  stripChart: {
    fields: [{ k: 'gs', type: 'var', kind: 'factor', multi: true, min: 0, label: 'Factors (pick zero or more)' },
      { k: 'y', type: 'var', kind: 'numeric', label: 'Response Variable (pick one)' },
      choice('method', '', [['stack', 'Stack'], ['jitter', 'Jitter']], undefined, { prompt: 'Duplicate Values' }), ...plotLabels()],
    code(v, c) {
      const method = `, method="${v.method}"`;
      if (!v.gs.length) return `stripchart(${c.ds}$${v.y}${method}, xlab="${given(v.xlab) ? v.xlab.trim() : v.y}"${labelArg(v, 'ylab')}${labelArg(v, 'main')})`;
      return `stripchart(${v.y} ~ ${v.gs.join('*')}, vertical=TRUE${method}${labelArg(v, 'xlab')}, ylab="${given(v.ylab) ? v.ylab.trim() : v.y}"${labelArg(v, 'main')}, data=${c.ds})`;
    } },

  barGraph: {
    fields: [{ k: 'f', type: 'var', kind: 'factor', label: 'Variable (pick one)' }, groupsBox(),
      choice('scale', 'Axis Scaling', [['frequency', 'Frequency counts'], ['percent', 'Percentages']]),
      choice('style', 'Style of Group Bars', [['divided', 'Divided (stacked)'], ['parallel', 'Side-by-side (parallel)']], undefined, { when: v => Boolean(v.g) }),
      choice('conditional', 'Percentages for Group Bars', [['conditional', 'Conditional'], ['total', 'Total']], undefined, { when: v => Boolean(v.g) }),
      choice('colors', 'Color Selection', [['default', 'Default'], ['palette', 'From color palette']]),
      choice('legend', 'Position of Legend', [['above', 'Above plot'], ['topright', 'Right'], ['top', 'Center'], ['topleft', 'Left']], undefined, { when: v => Boolean(v.g) }),
      check('showcounts', 'Show counts or percentages in bars', true), ...plotLabels()],
    async after(v, ui) { v.nlevels = v.g ? Number((await ui.query(`nlevels(as.factor(${ui.ctx.ds}$${v.g}))`))?.[0] || 2) : 0; return true; },
    code(v, c) {
      const xlab = `, xlab="${given(v.xlab) ? v.xlab.trim() : v.f}"`;
      const ylab = `, ylab="${given(v.ylab) ? v.ylab.trim() : v.scale === 'frequency' ? 'Frequency' : 'Percent'}"`;
      const scale = v.scale === 'frequency' ? '' : ', scale="percent"';
      const counts = v.showcounts.showcounts ? ', label.bars=TRUE' : ', label.bars=FALSE';
      if (!v.g) return `with(${c.ds}, Barplot(${v.f}${xlab}${ylab}${labelArg(v, 'main')}${v.colors === 'default' ? '' : ', col=palette()[2]'}${scale}${counts}))`;
      return `with(${c.ds}, Barplot(${v.f}, by=${v.g}, style="${v.style}", legend.pos="${v.legend}"${xlab}${ylab}${labelArg(v, 'main')}` +
        `${v.colors === 'default' ? '' : `, col=palette()[2:${v.nlevels + 1}]`}${scale}${v.conditional === 'conditional' ? '' : ', conditional=FALSE'}${counts}))`;
    } },
  pieChart: {
    fields: [{ k: 'f', type: 'var', kind: 'factor', label: 'Variable (pick one)' },
      choice('colors', 'Color Selection', [['default', 'Default'], ['palette', 'From color palette']]),
      choice('scale', 'Include in Segment Labels', [['percent', 'Percentages'], ['frequency', 'Frequency counts'], ['none', 'Neither']]), ...plotLabels()],
    async after(v, ui) { v.nlevels = Number((await ui.query(`nlevels(as.factor(${ui.ctx.ds}$${v.f}))`))?.[0] || 2); return true; },
    code: (v, c) => `with(${c.ds}, piechart(${v.f}, xlab="${given(v.xlab) ? v.xlab.trim() : ''}", ylab="${given(v.ylab) ? v.ylab.trim() : ''}", main="${given(v.main) ? v.main.trim() : v.f}"` +
      `${v.colors === 'default' ? `, col=colorspace::rainbow_hcl(${v.nlevels})` : `, col=palette()[2:${v.nlevels + 1}]`}, scale="${v.scale}"))` },

  // The rgl window is R's own. Identify3D (Identify observations with mouse) reuses the variables of the last Scatter3D.
  Scatter3D: { pkgs: ['rgl'],
    remember: (v, c, commander) => {
      commander.identify3d = `Identify3d(${c.ds}$${v.xs[0]}, ${c.ds}$${v.y}, ${c.ds}$${v.xs[1]}${v.g ? `, groups=${c.ds}$${v.g}` : ''}, axis.scales=${v.show.scales ? 'TRUE' : 'FALSE'}, labels=row.names(${c.ds}))`;
    },
    fields: [{ k: 'xs', type: 'var', kind: 'numeric', multi: true, min: 2, max: 2, label: 'Explanatory variables (pick two)' },
      { k: 'y', type: 'var', kind: 'numeric', exclude: ['xs'], label: 'Response variable (pick one)' },
      groupsBox(), check('parallel', 'Parallel regression surfaces', false, { when: v => Boolean(v.g) }),
      { k: 'show', type: 'flags', label: '', items: [['scales', 'Show axis scales', true], ['grid', 'Show surface grid lines', true], ['squares', 'Show squared residuals', false]] },
      { k: 'surfaces', type: 'flags', label: 'Surfaces to Fit', items: [['linear', 'Linear least-squares', false], ['quadratic', 'Quadratic least-squares', false],
        ['robust', 'Robust linear regression', false], ['smooth', 'Smooth regression', false], ['additive', 'Additive regression', false]] },
      { k: 'dfSmooth', type: 'text', label: 'df = ', def: AUTO, compact: true, when: v => v.surfaces.smooth },
      { k: 'dfAdd', type: 'text', label: 'df(each term) = ', def: AUTO, compact: true, when: v => v.surfaces.additive },
      check('ellipsoid', 'Plot 50% concentration ellipsoid'),
      choice('bg', 'Background Color', [['black', 'Black'], ['white', 'White']], 'white'),
      choice('identify', 'Identify Points', [['auto', 'Automatically'], MOUSE, ['not', 'Do not identify']], 'not'),
      { k: 'mouseNote', type: 'note', label: 'Drag the right mouse button to identify points,\nclick the right button to exit.', when: v => v.identify === 'mouse' }, idn(),
      { k: 'rotations', type: 'num', int: true, min: 0, def: '0', label: 'Number of automatic rotations  ' }],
    code(v, c) {
      const surfaces = ['linear', 'quadratic', 'robust', 'smooth', 'additive'].filter(s => v.surfaces[s]).map(s => `"${s}"`);
      const fit = !surfaces.length ? ', surface=FALSE' : surfaces.length === 1 ? `, fit=${surfaces[0]}` : `, fit=c(${surfaces.join(',')})`;
      const dfs = `${v.surfaces.smooth && v.dfSmooth.trim() !== AUTO ? `, df.smooth=${Number(v.dfSmooth)}` : ''}${v.surfaces.additive && v.dfAdd.trim() !== AUTO ? `, df.additive=${Number(v.dfAdd)}` : ''}`;
      const id = v.identify === 'auto' ? `, id=list(method='mahal', n =${v.idn})` : v.identify === 'mouse' ? ", id=list(method='identify')" : '';
      return 'library(rgl)\n' + `scatter3d(${v.y}~${v.xs[0]}+${v.xs[1]}${v.g ? `|${v.g}` : ''}, data=${c.ds}${fit}${v.show.squares ? ', residuals="squares"' : ', residuals=TRUE'}${dfs}` +
        `${v.g ? `, parallel=${v.parallel.parallel ? 'TRUE' : 'FALSE'}` : ''}, bg="${v.bg}", axis.scales=${v.show.scales ? 'TRUE' : 'FALSE'}, grid=${v.show.grid ? 'TRUE' : 'FALSE'}` +
        `, ellipsoid=${v.ellipsoid.ellipsoid ? 'TRUE' : 'FALSE'}${id}${v.rotations !== '0' ? `, revolutions = ${v.rotations}` : ''})`;
    } },
  saveBitmap: { ds: false,
    fields: [choice('type', 'Graphics File Type', [['png', 'PNG'], ['jpeg', 'JPEG']]), choice('units', 'Units', [['in', 'inches'], ['cm', 'cm'], ['px', 'pixels']]),
      { k: 'width', type: 'num', min: 0.1, def: '7', label: 'Width' }, { k: 'height', type: 'num', min: 0.1, def: '7', label: 'Height' },
      { k: 'res', type: 'num', int: true, min: 20, def: '72', label: 'Resolution', when: v => v.units !== 'px' },
      { k: 'pointsize', type: 'num', int: true, min: 6, max: 16, def: '12', label: 'Text size (points)' }],
    async after(v, ui) { v.file = await saveTo(ui, v.type, v.type === 'png' ? 'png' : 'jpg'); return Boolean(v.file); },
    // Rcmdr uses dev.print(), which needs a screen device; dev.copy() also works from VS Code's plot viewer.
    code: v => `dev.copy(${v.type}, filename="${v.file}", width=${v.width}, height=${v.height}, pointsize=${v.pointsize}, units="${v.units}"${v.units === 'px' ? '' : `, res=${v.units === 'cm' ? Math.round(Number(v.res) / 2.54) : v.res}`})\ninvisible(dev.off())` },
  savePDF: { ds: false,
    fields: [choice('type', 'Graphics File Type', [['pdf', 'PDF'], ['postscript', 'Postscript'], ['eps', 'Encapsulated Postscript']]),
      choice('units', 'Units', [['in', 'inches'], ['cm', 'cm']]),
      { k: 'width', type: 'num', min: 0.1, def: '7', label: 'Width' }, { k: 'height', type: 'num', min: 0.1, def: '7', label: 'Height' },
      { k: 'pointsize', type: 'num', int: true, min: 6, max: 16, def: '12', label: 'Text size (points)' }],
    async after(v, ui) { v.file = await saveTo(ui, v.type, { pdf: 'pdf', postscript: 'ps', eps: 'eps' }[v.type]); return Boolean(v.file); },
    code(v) {
      const size = x => (v.units === 'cm' ? Math.round((Number(x) / 2.54) * 10) / 10 : x);
      // As in saveBitmap, dev.copy() instead of dev.print()/dev.copy2eps(), which need a screen device.
      return (v.type === 'eps' ? `dev.copy(postscript, file="${v.file}", width=${size(v.width)}, height=${size(v.height)}, pointsize=${v.pointsize}, onefile=FALSE, horizontal=FALSE, paper="special")`
        : `dev.copy(${v.type}, file="${v.file}", width=${size(v.width)}, height=${size(v.height)}, pointsize=${v.pointsize})`) + '\ninvisible(dev.off())';
    } },
  Identify3D: { ds: false, pkgs: ['rgl', 'car'],
    emptyMessage: 'There is no current RGL graphics device. Draw a 3D scatterplot first.',
    code: (v, c) => (c.identify3d ? `library(rgl)\n${c.identify3d}` : '') },
  saveRglGraph: { ds: false, pkgs: ['rgl'],
    async after(v, ui) { v.file = await ui.file({ mode: 'save', filters: { 'PNG Files': ['png'] }, def: 'RGLGraph.png' }, ui.t('Save the graph as')); return Boolean(v.file); },
    code: v => `library(rgl)\nrgl.snapshot("${v.file}")` }
};


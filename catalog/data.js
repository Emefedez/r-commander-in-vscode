const { rs, rc, rbool, S, typedVector, splitList, isNumber } = require('../lib/rhelpers');
const { numVars, anyVar, factors, newName } = require('./common');

const dsName = (k = 'name', def = 'Dataset') => ({ k, type: 'name', label: 'Name for the data set', def });
const derived = suffix => (k = 'name') => ({ k, type: 'name', label: 'Name for the new data set', def: c => `${c.ds}.${suffix}` });
const setActive = v => v.name;
const readOpts = [
  { k: 'flags', type: 'flags', label: 'Options', items: [['header', 'Variable names in file', true], ['strip', 'Strip white space from text fields', true]] },
  { k: 'na', type: 'text', label: 'Missing data indicator', def: 'NA' },
  { k: 'sep', type: 'choice', label: 'Field separator', choices: [['', 'White space'], [',', 'Commas'], ['\t', 'Tabs'], [';', 'Semicolons'], ['other', 'Other']] },
  { k: 'sepOther', type: 'text', label: 'Specify:', def: '|', pattern: /^\S$/, error: 'Enter a single character.', when: v => v.sep === 'other' },
  { k: 'dec', type: 'choice', label: 'Decimal-point character', choices: [['.', 'Period [.]'], [',', 'Comma [,]']] }
];
const readTable = (v, source) =>
  `${v.name} <- read.table(${source}, header = ${rbool(v.flags.header)}, stringsAsFactors = TRUE, sep = ${rs(v.sep === 'other' ? v.sepOther : v.sep)}, ` +
  `na.strings = ${rs(v.na)}, dec = ${rs(v.dec)}, strip.white = ${rbool(v.flags.strip)})`;
const importFile = (title, filters, code, pkgs, extra = []) => ({
  ds: false, pkgs, activeDataset: setActive,
  fields: [dsName(), { k: 'file', type: 'file', mode: 'open', label: title, filters }, ...extra],
  code
});
// Options Rcmdr offers after importing from another statistics program.
const importFlags = (items) => ({ k: 'flags', type: 'flags', label: 'Options', items });
const afterImport = (v, c = { ds: v.name }) => [
  v.flags?.lower && `names(${v.name}) <- tolower(names(${v.name}))`,
  v.flags?.rownames && `rownames(${v.name}) <- ${v.name}[[1]]\n${v.name}[[1]] <- NULL`,
  v.flags?.factors && `${v.name}[sapply(${v.name}, is.character)] <- lapply(${v.name}[sapply(${v.name}, is.character)], as.factor)`
].filter(Boolean);
// What kind of file the user chose, from its extension.
const fileKind = file => {
  const f = String(file || '').toLowerCase();
  if (/\.(rdata|rda)$/.test(f)) return 'rdata';
  if (/\.rds$/.test(f)) return 'rds';
  if (/\.(xlsx|xls|xlsm)$/.test(f)) return 'excel';
  return f ? 'text' : '';
};
// A valid R name taken from the file name.
const baseName = file => {
  const stem = String(file || '').split(/[\\/]/).pop().replace(/\.[^.]*$/, '').replace(/[^A-Za-z0-9._]/g, '.');
  return /^[A-Za-z.]/.test(stem) ? stem : `Dataset.${stem}`;
};
const NEWVAR = (k, label, def, optional = false) => ({ k, type: 'text', label, def, optional });
const newCol = (c, name) => `${c.ds}$${S(name)}`;

module.exports = {
  newDataSet: { ds: false, activeDataset: setActive,
    fields: [dsName(), { k: 'names', type: 'text', label: 'Variable names separated by commas', def: 'x, y' }],
    async after(v, ui) {
      const names = v.names.split(',').map(s => s.trim()).filter(Boolean);
      const columns = [];
      for (const name of names) {
        const text = await ui.text({ label: ui.t('Values of {0}, separated by commas', name), def: '',
          validate: s => s.trim() ? undefined : ui.t('A value is required.') });
        if (text === undefined) return false;
        columns.push([name, typedVector(text)]);
      }
      if (new Set(columns.map(c => c[1].count)).size > 1) {
        await ui.vscode.window.showErrorMessage(ui.t('All variables need the same number of values.'));
        return false;
      }
      v.columns = columns;
      return true;
    },
    code: v => `${v.name} <- data.frame(${v.columns.map(([n, col]) => `${S(n)} = ${col.code}`).join(', ')}, check.names = FALSE)` },
  // File > Load data set. Rcmdr only runs load(file) and fails when the file holds several objects;
  // this one lets you pick which data sets to load, rename a single one, and also opens .rds,
  // text/CSV and Excel files.
  loadDataSet: { ds: false, detectNew: true,
    fields: [
      { k: 'file', type: 'file', mode: 'open', label: 'Select the file to load',
        filters: { 'R data': ['RData', 'rda', 'Rda', 'RDA'], 'R single object': ['rds'], 'Text files': ['csv', 'txt', 'tsv', 'dat'], 'Excel': ['xlsx', 'xls'], 'All files': ['*'] } },
      { k: 'objects', type: 'rlist', of: 'file', label: 'Data sets in the file (pick one or more)', when: v => fileKind(v.file) === 'rdata',
        exprFor: file => `local({ e <- new.env(); objs <- load(${rs(file)}, envir = e); objs <- Filter(function(n) is.data.frame(get(n, e)), objs); ` +
          `vapply(objs, function(n) paste0(n, "\\t", nrow(get(n, e)), " x ", ncol(get(n, e)), " (", paste(names(get(n, e))[seq_len(min(4, ncol(get(n, e))))], collapse = ", "), "...)"), "") })` },
      { k: 'rename', type: 'text', optional: true, def: '', label: 'Name for the data set (blank keeps its name; only for a single data set)',
        pattern: /^[A-Za-z.][A-Za-z0-9._]*$/, error: 'Enter a valid R name or leave it blank.', sample: 'Loaded', when: v => fileKind(v.file) === 'rdata' && (v.objects || []).length === 1 },
      { k: 'name', type: 'name', label: 'Name for the data set', def: (c, v) => baseName(v.file), when: v => ['rds', 'text', 'excel'].includes(fileKind(v.file)) },
      { k: 'header', type: 'flags', label: 'Options', items: [['header', 'Variable names in file', true]], when: v => ['text', 'excel'].includes(fileKind(v.file)) },
      { k: 'sep', type: 'choice', label: 'Field separator', choices: [['auto', 'Detect from the file name'], ['', 'White space'], [',', 'Commas'], ['\t', 'Tabs'], [';', 'Semicolons']], when: v => fileKind(v.file) === 'text' },
      { k: 'dec', type: 'choice', label: 'Decimal-point character', choices: [['.', 'Period [.]'], [',', 'Comma [,]']], when: v => fileKind(v.file) === 'text' },
      { k: 'sheet', type: 'text', optional: true, def: '1', label: 'Sheet (number or name)', sample: '1', when: v => fileKind(v.file) === 'excel' },
      { k: 'show', type: 'flags', label: 'After loading', items: [['show', 'Show the first rows', false]] }
    ],
    pkgs: undefined,
    activeDataset: v => (v.name || v.rename || (v.objects || [])[0] || '').trim() || undefined,
    code(v) {
      const kind = fileKind(v.file);
      const lines = [];
      let names;
      if (kind === 'rdata') {
        const all = v.objects || [];
        names = v.rename && all.length === 1 ? [v.rename.trim()] : all;
        if (v.rename && all.length === 1) {
          lines.push(`local({ e <- new.env(); load(${rs(v.file)}, envir = e); assign(${rs(names[0])}, get(${rs(all[0])}, envir = e), envir = globalenv()) })`);
        } else {
          // Only the chosen data sets: copy them out of a scratch environment.
          lines.push(`local({ e <- new.env(); load(${rs(v.file)}, envir = e); for (n in ${rc(all)}) assign(n, get(n, envir = e), envir = globalenv()) })`);
        }
      } else if (kind === 'rds') {
        names = [v.name];
        lines.push(`${S(v.name)} <- readRDS(${rs(v.file)})`, `if (!is.data.frame(${S(v.name)})) ${S(v.name)} <- as.data.frame(${S(v.name)})`);
      } else if (kind === 'excel') {
        names = [v.name];
        const sheet = isNumber(v.sheet) ? v.sheet.trim() : rs(v.sheet.trim() || '1');
        lines.push(`${S(v.name)} <- as.data.frame(readxl::read_excel(${rs(v.file)}, sheet = ${sheet}, col_names = ${rbool(v.header.header)}))`);
      } else {
        names = [v.name];
        const sep = v.sep === 'auto' ? (/\.csv$/i.test(v.file) ? ',' : /\.tsv$/i.test(v.file) ? '\t' : '') : v.sep;
        lines.push(`${S(v.name)} <- read.table(${rs(v.file)}, header = ${rbool(v.header.header)}, sep = ${rs(sep)}, dec = ${rs(v.dec)}, stringsAsFactors = TRUE, strip.white = TRUE, na.strings = "NA")`);
      }
      if (v.show.show) lines.push(...names.map(n => `print(head(${S(n)}))`));
      return lines.join('\n');
    } },
  mergeDataSets: { ds: false, activeDataset: setActive,
    fields: [
      { k: 'first', type: 'dataset', label: 'First data set' },
      { k: 'second', type: 'dataset', label: 'Second data set' },
      { k: 'kind', type: 'choice', label: 'Merge', choices: [['cols', 'Columns: match rows by common variables'], ['rows', 'Rows: stack one data set under the other']] },
      { k: 'name', type: 'name', label: 'Name for the merged data set', def: 'MergedDataset' }
    ],
    async after(v, ui) {
      if (v.kind === 'rows') { v.by = []; return true; }
      const vars = n => ui.state.datasets[n].vars.map(x => x.name);
      const common = vars(v.first).filter(n => vars(v.second).includes(n));
      if (!common.length) { await ui.vscode.window.showWarningMessage(ui.t('The data sets have no variables in common.')); return false; }
      const picked = await ui.pick(ui.t('Variables to match on'), common.map(label => ({ label, picked: true })), true);
      if (!picked) return false;
      v.by = picked.map(p => p.label);
      const how = await ui.pick(ui.t('Rows to keep'), [
        { label: ui.t('Only rows matching in both'), value: '' },
        { label: ui.t('All rows from both'), value: ', all = TRUE' },
        { label: ui.t('All rows of the first'), value: ', all.x = TRUE' },
        { label: ui.t('All rows of the second'), value: ', all.y = TRUE' }]);
      if (how === undefined) return false;
      v.how = how;
      return true;
    },
    code: v => v.kind === 'rows' ? `${v.name} <- rbind(${v.first}, ${v.second})`
      : `${v.name} <- merge(${v.first}, ${v.second}, by = ${rc(v.by)}${v.how})` },

  readDataSet: { ds: false, activeDataset: setActive,
    fields: [dsName(),
      { k: 'source', type: 'choice', label: 'Read data from', choices: [['file', 'A local text file'], ['clip', 'The clipboard'], ['url', 'An Internet URL']] },
      { k: 'file', type: 'file', mode: 'open', label: 'Select the text file', when: v => v.source === 'file', filters: { 'Text files': ['txt', 'csv', 'dat', 'tsv'], 'All files': ['*'] } },
      { k: 'url', type: 'text', label: 'URL of the data file', when: v => v.source === 'url', pattern: /^(https?|ftp|file):\/\/\S+$/, error: 'Enter a URL (http, https, ftp or file).' },
      ...readOpts],
    async after(v, ui) {
      if (v.source === 'clip') v.clip = await ui.vscode.env.clipboard.readText();
      return true;
    },
    code: v => readTable(v, v.source === 'file' ? rs(v.file) : v.source === 'url' ? rs(v.url) : `text = ${rs(v.clip)}`) },
  importSPSS: importFile('Select the SPSS file', { 'SPSS': ['sav', 'por'] },
    v => [`${v.name} <- tryCatch(foreign::read.spss(${rs(v.file)}, use.value.labels = TRUE, max.value.labels = Inf, to.data.frame = TRUE),\n  error = function(e) as.data.frame(haven::as_factor(haven::read_sav(${rs(v.file)}))))`, ...afterImport(v)].join('\n'), ['foreign'],
    [importFlags([['factors', 'Convert character variables to factors', true], ['rownames', 'First column contains row names', false], ['lower', 'Convert variable names to lower case', true]])]),
  importSAS: importFile('Select the SAS xport file', { 'SAS xport': ['xpt', 'xport'] },
    v => `${v.name} <- tryCatch(foreign::read.xport(${rs(v.file)}), error = function(e) as.data.frame(haven::read_xpt(${rs(v.file)})))`, ['foreign']),
  importSASb7dat: importFile('Select the SAS b7dat file', { 'SAS b7dat': ['sas7bdat'] },
    v => [`${v.name} <- as.data.frame(haven::read_sas(${rs(v.file)}))`, ...afterImport(v)].join('\n'), ['haven'],
    [importFlags([['factors', 'Convert character variables to factors', true], ['rownames', 'First column contains row names', false]])]),
  importMinitab: importFile('Select the Minitab file', { 'Minitab': ['mtp'] },
    v => `${v.name} <- as.data.frame(foreign::read.mtp(${rs(v.file)}))`, ['foreign']),
  importSTATA: importFile('Select the STATA file', { 'STATA': ['dta'] },
    v => [`${v.name} <- tryCatch(foreign::read.dta(${rs(v.file)}, convert.dates = ${rbool(v.flags.dates)}, convert.factors = TRUE, convert.underscore = TRUE),\n  error = function(e) as.data.frame(haven::as_factor(haven::read_dta(${rs(v.file)}))))`, ...afterImport(v)].join('\n'), ['foreign'],
    [importFlags([['factors', 'Convert character variables to factors', true], ['dates', 'Convert dates to R format', true], ['rownames', 'First column contains row names', false]])]),
  importExcel: { ...importFile('Select the Excel file', { 'Excel': ['xlsx', 'xls', 'xlsm'] },
    v => [`${v.name} <- as.data.frame(readxl::read_excel(${rs(v.file)}, sheet = ${v.sheet}, col_names = ${rbool(v.flags.header)}${v.na.trim() && v.na.trim() !== '<empty cell>' ? `, na = ${rs(v.na.trim())}` : ''}))`, ...afterImport(v)].join('\n'), ['readxl'],
    [importFlags([['header', 'Variable names in first row of spreadsheet', true], ['rownames', 'Row names in first column of spreadsheet', false], ['factors', 'Convert character variables to factors', false]]),
      { k: 'na', type: 'text', optional: true, def: '<empty cell>', label: 'Missing data indicator', sample: 'NA' }]),
    async after(v, ui) {
      const sheets = await ui.query(`readxl::excel_sheets(${rs(v.file)})`);
      v.sheet = '1';
      if (sheets && sheets.length > 1) {
        const picked = await ui.pick(ui.t('Sheet to import'), sheets.map(label => ({ label })));
        if (picked === undefined) return false;
        v.sheet = rs(picked);
      }
      return true;
    } },

  listDataSetsInPackages: { ds: false, code: () => 'print(data()$results[, c("Package", "Item", "Title")])' },
  readDataFromPackage: { ds: false,
    async after(v, ui) {
      const packages = await ui.query('sort(.packages())');
      const pkg = packages ? await ui.pick(ui.t('Attached package'), packages.map(label => ({ label }))) :
        await ui.text({ label: ui.t('Package name'), def: 'datasets' });
      if (pkg === undefined) return false;
      const items = await ui.query(`sub(" .*$", "", data(package = ${rs(pkg)})$results[, "Item"])`);
      const item = items?.length ? await ui.pick(ui.t('Data set'), items.map(label => ({ label }))) :
        await ui.text({ label: ui.t('Data set name') });
      if (!item) return false;
      Object.assign(v, { pkg, item });
      return true;
    },
    activeDataset: v => v.item,
    code: v => `data(list = ${rs(v.item)}, package = ${rs(v.pkg)})` },

  // Data > Active data set > View data: choose variables and a subset, as Rcmdr does.
  viewData: { fields: [{ k: 'flags', type: 'flags', label: 'Variables', items: [['all', 'Include all variables', true]] },
      { ...anyVar('vars', 'Variables (select one or more)', { multi: true }), when: v => !v.flags.all },
      { k: 'expr', type: 'text', optional: true, def: '<all cases>', label: 'Subset expression', sample: 'n1 > 1', pattern: /^(<all cases>|.*)$/ }],
    code(v, c) {
      const subset = v.expr.trim() && v.expr.trim() !== '<all cases>' ? `, subset = ${v.expr.trim()}` : '';
      return v.flags.all && !subset ? `View(${c.ds})` : `View(subset(${c.ds}${subset}${v.flags.all ? '' : `, select = ${rc(v.vars)}`}), title = ${rs(c.ds)})`;
    } },
  // The toolbar button: show the whole data set right away.
  viewDataSet: { extraIn: 'toolbar', label: { en: 'View data set', es: 'Visualizar conjunto de datos' }, code: (v, c) => `View(${c.ds})` },
  selectActiveDataSet: { ds: false, select: 'dataset' },
  refreshActiveDataSet: { refresh: true },
  helpDataSet: { code: (v, c) => `help(${rs(c.ds)})` },
  variablesDataSet: { code: (v, c) => `names(${c.ds})` },
  // The toolbar button: R's own spreadsheet-style editor in its own window.
  editDataSet: { extraIn: 'toolbar', label: { en: 'Edit data set', es: 'Editar conjunto de datos' }, code: (v, c) => `${c.ds} <- edit(${c.ds})` },
  editDataValue: { extraIn: 'activeMenu', label: { en: 'Edit one value...', es: 'Editar un valor...' },
    fields: [anyVar('var', 'Variable to edit'), { k: 'row', type: 'num', int: true, min: 1, def: '1', label: 'Row number' },
      { k: 'value', type: 'text', label: 'New value (NA for missing)', def: 'NA' }],
    code(v, c) {
      const kind = c.kindOf(v.var);
      const value = v.value.trim() === 'NA' ? 'NA' : kind === 'numeric' && isNumber(v.value) ? v.value.trim()
        : kind === 'logical' && /^(TRUE|FALSE)$/.test(v.value.trim()) ? v.value.trim() : rs(v.value);
      return `${c.ds}[${v.row}, ${rs(v.var)}] <- ${value}`;
    } },

  setCaseNames: { fields: [anyVar('var', 'Variable with the case names'),
      { k: 'flags', type: 'flags', label: 'Options', items: [['drop', 'Remove the variable from the data set', true]] }],
    code: (v, c) => [`rownames(${c.ds}) <- as.character(${c.dv(v.var)})`, ...(v.flags.drop ? [`${c.dv(v.var)} <- NULL`] : [])].join('\n') },
  subsetDataSet: { activeDataset: setActive,
    fields: [{ k: 'flags', type: 'flags', label: 'Variables', items: [['all', 'Include all variables', true]] },
      { ...anyVar('vars', 'Variables to include', { multi: true }), when: v => !v.flags.all },
      { k: 'expr', type: 'text', optional: true, label: 'Subset expression (blank for all cases), e.g. age > 30 & sex == "F"', def: '' },
      derived('subset')()],
    code: (v, c) => `${v.name} <- subset(${c.ds}${v.expr.trim() ? `, subset = ${v.expr.trim()}` : ''}${v.flags.all ? '' : `, select = ${rc(v.vars)}`})` },
  sortDataSet: { fields: [anyVar('vars', 'Variables to sort by (in this order)', { multi: true }),
      { k: 'flags', type: 'flags', label: 'Order', items: [['desc', 'Sort in decreasing order', false]] },
      { k: 'name', type: 'text', optional: true, def: '<same as active data set>', label: 'Name for sorted data set', pattern: /^(<same as active data set>|[A-Za-z.][A-Za-z0-9._]*)$/, error: 'Enter a valid R name or leave it as is.', sample: 'Sorted' }],
    activeDataset: v => (v.name.trim() && v.name.trim() !== '<same as active data set>' ? v.name.trim() : undefined),
    code: (v, c) => `${v.name.trim() && v.name.trim() !== '<same as active data set>' ? v.name.trim() : c.ds} <- ${c.ds}[order(${v.vars.map(n => c.dv(n)).join(', ')}, decreasing = ${rbool(v.flags.desc)}), , drop = FALSE]` },
  Aggregate: { activeDataset: setActive,
    fields: [numVars('xs', 'Variables to aggregate (numeric)'), factors('gs', 'Aggregate by (factors)'),
      { k: 'fun', type: 'choice', label: 'Statistic', choices: [...['mean', 'median', 'sum', 'sd', 'var', 'min', 'max'].map(f => [f, f]), ['other', 'Other (specify)']] },
      { k: 'funOther', type: 'text', label: 'Other (specify)', def: 'function(x) quantile(x, 0.9)', when: v => v.fun === 'other' },
      { k: 'name', type: 'name', label: 'Name for the aggregated data set', def: 'AggregatedData' }],
    code: (v, c) => `${v.name} <- aggregate(${c.cols(v.xs)}, by = list(${v.gs.map(g => `${S(g)} = ${c.dv(g)}`).join(', ')}), FUN = ${v.fun === 'other' ? v.funOther.trim() : v.fun})` },
  SelectRows: { activeDataset: setActive,
    fields: [{ k: 'rows', type: 'text', label: 'Rows to select: numbers, row names or a condition, e.g. 1:10, c(2, 5) or age > 30', def: '1:10' },
      derived('rows')()],
    code: (v, c) => `${v.name} <- ${c.ds}[${v.rows.trim()}, , drop = FALSE]` },
  RemoveRows: { activeDataset: setActive,
    fields: [{ k: 'rows', type: 'text', label: 'Rows to remove, e.g. 3, 5:8 or c(1, 4)', def: '1' }, derived('reduced')()],
    code: (v, c) => `${v.name} <- ${c.ds}[-c(${v.rows.trim()}), , drop = FALSE]` },
  Stack: { activeDataset: setActive,
    fields: [numVars('xs', 'Variables to stack (pick two or more)', 2),
      { k: 'values', type: 'name', label: 'Name for the variable holding the values', def: 'values' },
      { k: 'ind', type: 'name', label: 'Name for the factor identifying the variables', def: 'variable' }, derived('stacked')()],
    code: (v, c) => `${v.name} <- stack(${c.cols(v.xs)})\nnames(${v.name}) <- ${rc([v.values, v.ind])}` },
  filterNA: { activeDataset: setActive,
    fields: [{ k: 'flags', type: 'flags', label: 'Variables', items: [['all', 'Use all variables', true]] },
      { ...anyVar('vars', 'Variables that must be complete', { multi: true }), when: v => !v.flags.all }, derived('complete')()],
    code: (v, c) => v.flags.all ? `${v.name} <- na.omit(${c.ds})` : `${v.name} <- ${c.ds}[complete.cases(${c.cols(v.vars)}), , drop = FALSE]` },
  reshapeLong2Wide: { activeDataset: setActive,
    fields: [anyVar('ids', 'Variables identifying each subject (id variables)', { multi: true }),
      anyVar('time', 'Variable identifying the repeated measurements', { exclude: ['ids'] }),
      anyVar('vals', 'Variables to reshape (the measurements)', { multi: true, exclude: ['ids', 'time'] }), derived('wide')()],
    code: (v, c) => `${v.name} <- reshape(${c.ds}, idvar = ${rc(v.ids)}, timevar = ${rs(v.time)}, v.names = ${rc(v.vals)}, direction = "wide")` },
  reshapeWide2Long: { activeDataset: setActive,
    fields: [numVars('vars', 'Variables to reshape (pick two or more)', 2),
      { k: 'val', type: 'name', label: 'Name for the new value variable', def: 'value' },
      { k: 'time', type: 'name', label: 'Name for the new variable identifying the measurement', def: 'time' }, derived('long')()],
    code: (v, c) => `${v.name} <- reshape(${c.ds}, varying = list(${rc(v.vars)}), v.names = ${rs(v.val)}, timevar = ${rs(v.time)}, ` +
      `times = ${rc(v.vars)}, direction = "long")` },
  convertStrings2Factors: { code: (v, c) => `${c.ds}[sapply(${c.ds}, is.character)] <- lapply(${c.ds}[sapply(${c.ds}, is.character)], as.factor)` },
  saveDataSet: { fields: [{ k: 'file', type: 'file', mode: 'save', def: 'dataset.RData', label: 'Save the active data set as', filters: { 'R data': ['RData', 'rda'] } }],
    code: (v, c) => `save(${rs(c.ds)}, file = ${rs(v.file)})` },
  exportDataSet: { fields: [{ k: 'file', type: 'file', mode: 'save', def: 'dataset.csv', label: 'Export the active data set to', filters: { 'Text files': ['csv', 'txt', 'tsv'] } },
      { k: 'flags', type: 'flags', label: 'Options', items: [['names', 'Write variable names', true], ['rows', 'Write row names', false], ['quote', 'Quote character values', true]] },
      { k: 'sep', type: 'choice', label: 'Field separator', choices: [[',', 'Commas'], [' ', 'Spaces'], ['\t', 'Tabs'], [';', 'Semicolons'], ['other', 'Other']] },
      { k: 'sepOther', type: 'text', label: 'Specify:', def: '|', pattern: /^\S$/, error: 'Enter a single character.', when: v => v.sep === 'other' },
      { k: 'na', type: 'text', label: 'Missing data indicator', def: 'NA' }],
    code: (v, c) => `write.table(${c.ds}, ${rs(v.file)}, sep = ${rs(v.sep === 'other' ? v.sepOther : v.sep)}, col.names = ${rbool(v.flags.names)}, row.names = ${rbool(v.flags.rows)}, ` +
      `quote = ${rbool(v.flags.quote)}, na = ${rs(v.na)})` },

  RecodeDialog: { pkgs: ['car'],
    fields: [anyVar('vars', 'Variables to recode', { multi: true }),
      NEWVAR('suffix', 'Suffix for the new variable names (e.g. _recoded)', '_recoded'),
      { k: 'rules', type: 'text', label: "Recode directives, e.g. lo:0 = 'negative'; 1:hi = 'positive'; else = NA", def: "lo:0 = 'negative'; else = 'positive'" },
      { k: 'flags', type: 'flags', label: 'Options', items: [['factor', 'Make the new variables factors', true]] }],
    code: (v, c) => v.vars.map(n => `${newCol(c, n + v.suffix.trim())} <- car::recode(${c.dv(n)}, ${rs(v.rules)}, as.factor = ${rbool(v.flags.factor)})`).join('\n') },
  Compute: { fields: [NEWVAR('name', 'Name of the new variable', 'variable'),
      { k: 'expr', type: 'text', label: 'Expression to compute, using the variables of the data set, e.g. log(x) or (a + b) / 2', def: '' }],
    code: (v, c) => `${newCol(c, v.name.trim())} <- with(${c.ds}, ${v.expr.trim()})` },
  addObsNumbers: { code: (v, c) => `${newCol(c, 'ObsNumber')} <- 1:nrow(${c.ds})` },
  standardize: { fields: [numVars('vars', 'Variables to standardize'), NEWVAR('prefix', 'Prefix for the new variable names', 'Z.')],
    code: (v, c) => v.vars.map(n => `${newCol(c, v.prefix.trim() + n)} <- as.numeric(scale(${c.dv(n)}))`).join('\n') },
  numericToFactor: { fields: [numVars('vars', 'Numeric variables to convert'), NEWVAR('suffix', 'Suffix for the new variable names', '.f'),
      { k: 'labels', type: 'choice', label: 'Factor levels', choices: [['numbers', 'Use the numbers'], ['names', 'Supply level names']] }],
    async after(v, ui) {
      v.names = {};
      if (v.labels !== 'names') return true;
      for (const n of v.vars) {
        const levels = await ui.query(`as.character(sort(unique(${ui.ctx.dv(n)})))`);
        const text = await ui.text({ label: ui.t('Level names for {0}, in increasing order of value (current: {1})', n, (levels || []).join(', ')), def: (levels || []).join(', ') });
        if (text === undefined) return false;
        v.names[n] = splitList(text.replace(/\s*,\s*/g, ','));
      }
      return true;
    },
    code: (v, c) => v.vars.map(n => `${newCol(c, n + v.suffix.trim())} <- ` + (v.labels === 'names'
      ? `factor(${c.dv(n)}, levels = sort(unique(${c.dv(n)})), labels = ${rc(v.names[n])})` : `as.factor(${c.dv(n)})`)).join('\n') },
  characterToFactor: { fields: [anyVar('vars', 'Character variables to convert', { multi: true }), NEWVAR('suffix', 'Suffix for the new variable names (blank to replace)', '', true)],
    code: (v, c) => v.vars.map(n => `${newCol(c, n + v.suffix.trim())} <- as.factor(${c.dv(n)})`).join('\n') },
  binVariable: { pkgs: ['RcmdrMisc'],
    fields: [{ k: 'x', type: 'var', kind: 'numeric', label: 'Variable to bin' }, NEWVAR('name', 'Name for the binned variable', 'binned'),
      { k: 'bins', type: 'num', int: true, min: 2, def: '3', label: 'Number of bins' },
      { k: 'method', type: 'choice', label: 'Binning method', choices: [['intervals', 'Equal-width bins'], ['proportions', 'Equal-count bins'], ['natural', 'Natural breaks (k-means)']] },
      { k: 'labels', type: 'choice', label: 'Bin labels', choices: [['numbers', 'Numbers'], ['names', 'Supply bin names']] }],
    async after(v, ui) {
      if (v.labels !== 'names') return true;
      const text = await ui.text({ label: ui.t('Names for the {0} bins, separated by commas', v.bins), def: '',
        validate: s => splitList(s.replace(/\s*,\s*/g, ',')).length === Number(v.bins) ? undefined : ui.t('Enter exactly {0} names.', v.bins) });
      if (text === undefined) return false;
      v.names = splitList(text.replace(/\s*,\s*/g, ','));
      return true;
    },
    code: (v, c) => `${newCol(c, v.name.trim())} <- RcmdrMisc::binVariable(${c.dv(v.x)}, bins = ${v.bins}, method = ${rs(v.method)}, labels = ${v.labels === 'names' ? rc(v.names) : 'NULL'})` },
  reorderFactor: { fields: [{ k: 'f', type: 'var', kind: 'factor', label: 'Factor to reorder' },
      { k: 'order', type: 'levelorder', of: 'f', label: 'Levels in the new order' },
      NEWVAR('name', 'Name for the reordered factor (blank to replace)', '', true)],
    code: (v, c) => `${newCol(c, v.name.trim() || v.f)} <- factor(${c.dv(v.f)}, levels = ${rc(v.order)})` },
  dropUnusedFactorLevels: { fields: [{ k: 'vars', type: 'var', kind: 'factor', multi: true, label: 'Factors' }],
    code: (v, c) => v.vars.map(n => `${c.dv(n)} <- droplevels(as.factor(${c.dv(n)}))`).join('\n') },
  setContrasts: { fields: [{ k: 'f', type: 'var', kind: 'factor', label: 'Factor' },
      { k: 'type', type: 'choice', label: 'Contrasts', choices: [['contr.treatment', 'Treatment (dummy) contrasts'], ['contr.sum', 'Sum-to-zero (deviation) contrasts'], ['contr.helmert', 'Helmert contrasts'], ['contr.poly', 'Orthogonal polynomial contrasts'], ['custom', 'Other (specify)']] },
      { k: 'matrix', type: 'matrix', of: 'f', label: 'Enter Contrast Coefficients', when: v => v.type === 'custom' }],
    code(v, c) {
      const f = c.dv(v.f);
      if (v.type !== 'custom') return `${f} <- as.factor(${f})\ncontrasts(${f}) <- ${rs(v.type)}\ncontrasts(${f})`;
      const n = v.matrix.levels.length, k = n - 1;
      const byColumn = Array.from({ length: k }, (_, j) => v.matrix.rows.map(r => r[j])).flat();
      return `${f} <- as.factor(${f})\ncontrasts(${f}, how.many = ${k}) <- matrix(c(${byColumn.join(', ')}), nrow = ${n}, ncol = ${k}, ` +
        `dimnames = list(${rc(v.matrix.levels)}, paste0(".", 1:${k})))\ncontrasts(${f})`;
    } },
  renameVariables: { fields: [{ k: 'map', type: 'renames', label: 'Variables to rename' }],
    code: (v, c) => `names(${c.ds})[match(${rc(v.map.map(p => p[0]))}, names(${c.ds}))] <- ${rc(v.map.map(p => p[1]))}` },
  deleteVariable: { fields: [anyVar('vars', 'Variables to delete', { multi: true })],
    code: (v, c) => v.vars.map(n => `${c.dv(n)} <- NULL`).join('\n') }
};

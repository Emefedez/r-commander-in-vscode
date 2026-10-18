const { rs, rbool, S, typedVector, isSyntactic } = require('../lib/rhelpers');

// Each dialog has the fields of its Rcmdr counterpart (same labels, defaults and order) and writes the same R code.
// What Rcmdr asks in a second window after OK (a file to open, level names...) is asked in `after`.
const SAME = '<same as active data set>';
const nameOr = keep => new RegExp(`^(${keep}|([A-Za-z]|\\.(?![0-9]))[A-Za-z0-9._]*)$`);
const newDataSetName = (label = 'Name for new data set') =>
  ({ k: 'name', type: 'text', label, def: SAME, pattern: nameOr(SAME), error: 'Enter a valid R name.' });
const targetOf = (v, c) => (v.name.trim() === SAME ? c.ds : v.name.trim());
const dsEntry = (label = 'Enter name for data set:') => ({ k: 'name', type: 'name', label, def: 'Dataset' });
const check = (k, text, on = false) => ({ k, type: 'flags', label: '', items: [[k, text, on]] });
const OR = k => ({ k, type: 'note', label: '   OR' });
const quoted = names => `c(${names.map(n => `"${n}"`).join(',')})`;
// Rcmdr's getCases(): the rows typed (numbers or names, separated by spaces) are matched against the row names.
const caseList = text => `c(${(text.match(/"[^"]*"|'[^']*'|\S+/g) || []).map(x => `'${x.replace(/^["']|["']$/g, '')}'`).join(', ')})`;
const pickFile = async (ui, title, filters, mode = 'open', def) => ui.file({ mode, filters, def }, ui.t(title));

module.exports = {
  // Rcmdr opens its data editor after asking the name; here the editor is a few input boxes.
  newDataSet: { ds: false, activeDataset: v => v.name,
    fields: [dsEntry()],
    async after(v, ui) {
      const names = await ui.text({ label: ui.t('Variable names separated by commas'), def: 'x, y',
        validate: s => s.split(',').map(x => x.trim()).filter(Boolean).every(isSyntactic) ? undefined : ui.t('Enter a valid R name.') });
      if (names === undefined) return false;
      const columns = [];
      for (const name of names.split(',').map(s => s.trim()).filter(Boolean)) {
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
  // As Rcmdr: no dialog, a file chooser and load().
  loadDataSet: { ds: false, detectNew: true,
    async after(v, ui) {
      v.file = await pickFile(ui, 'Select the file to load', { 'R Data Files': ['RData', 'rda', 'Rda', 'RDA'], 'All Files': ['*'] });
      return Boolean(v.file);
    },
    code: v => `load(${rs(v.file)})` },
  mergeDataSets: { ds: false, activeDataset: v => v.name,
    fields: [{ k: 'name', type: 'name', label: 'Name for merged data set:  ', def: 'MergedDataset' },
      { k: 'first', type: 'dataset', label: 'First Data Set (pick one)' },
      { k: 'second', type: 'dataset', label: 'Second Data Set (pick one)' },
      { k: 'direction', type: 'choice', label: 'Direction of Merge', choices: [['rows', 'Merge rows'], ['columns', 'Merge columns']] },
      check('common', 'Merge only common\nrows or columns')],
    check: v => (v.first === v.second ? 'You cannot merge a data set with itself.' : undefined),
    code: v => v.direction === 'rows'
      ? `${v.name} <- mergeRows(${v.first}, ${v.second}, common.only=${rbool(v.common.common)})`
      : [`${v.name} <- merge(${v.first}, ${v.second}, all=${rbool(!v.common.common)}, by="row.names")`,
        `rownames(${v.name}) <- ${v.name}$Row.names`, `${v.name}$Row.names <- NULL`].join('\n') },

  readDataSet: { ds: false, activeDataset: v => v.name,
    fields: [dsEntry(),
      check('header', 'Variable names in file:', true),
      check('factors', 'Convert character variables to factors', true),
      { k: 'na', type: 'text', label: 'Missing data indicator:', def: 'NA' },
      { k: 'location', type: 'choice', label: 'Location of Data File', choices: [['local', 'Local file system'], ['clipboard', 'Clipboard'], ['url', 'Internet URL']] },
      { k: 'delimiter', type: 'choice', label: 'Field Separator', choices: [['whitespace', 'White space'], ['commas', 'Commas [,]'], ['semicolons', 'Semicolons [;]'], ['tabs', 'Tabs'], ['other', 'Other']] },
      { k: 'other', type: 'text', label: '    Specify:', def: '', optional: true, when: v => v.delimiter === 'other' },
      { k: 'decimal', type: 'choice', label: 'Decimal-Point Character', choices: [['period', 'Period [.]'], ['comma', 'Comma [,]']] }],
    async after(v, ui) {
      if (v.location === 'local') v.file = await pickFile(ui, 'Select the text file', { 'Text Files': ['txt', 'TXT', 'dat', 'DAT', 'csv', 'CSV'], 'All Files': ['*'] });
      else if (v.location === 'url') v.file = await ui.text({ label: ui.t('Internet URL'), def: '' });
      else v.file = 'clipboard';
      return Boolean(v.file);
    },
    code(v) {
      const sep = { whitespace: '', commas: ',', semicolons: ';', tabs: '\\t' }[v.delimiter] ?? v.other;
      return `${v.name} <- read.table("${v.file}", header=${rbool(v.header.header)}, stringsAsFactors=${rbool(v.factors.factors)}, sep="${sep}", ` +
        `na.strings="${v.na}", dec="${v.decimal === 'period' ? '.' : ','}", strip.white=TRUE)`;
    } },
  importSPSS: { ds: false, activeDataset: v => v.name,
    fields: [dsEntry('Enter name for data set:  '), check('factors', 'Convert character variables to factors', true),
      check('rownames', 'First column contains row names'), check('lower', 'Convert variable names to lower case')],
    async after(v, ui) {
      v.file = await pickFile(ui, 'Select the SPSS file', { 'SPSS portable files': ['por', 'POR'], 'SPSS save files': ['sav', 'SAV'], 'All Files': ['*'] });
      return Boolean(v.file);
    },
    code: v => `${v.name} <- readSPSS("${v.file}", rownames=${rbool(v.rownames.rownames)}, stringsAsFactors=${rbool(v.factors.factors)}, tolower=${rbool(v.lower.lower)})` },
  // Rcmdr asks the file first and then the name.
  importSAS: { ds: false, activeDataset: v => v.name,
    async after(v, ui) {
      v.file = await pickFile(ui, 'Select the SAS xport file', { 'SAS xport files': ['xpt', 'XPT', 'xport', 'XPORT'], 'All Files': ['*'] });
      if (!v.file) return false;
      const names = await ui.query(`local({ d <- foreign::read.xport(${rs(v.file)}); if (is.data.frame(d)) character() else names(d) })`);
      if (names && names.length > 1) {
        v.which = await ui.pick(ui.t('Datasets in file (pick one)'), names.map(label => ({ label })));
        if (v.which === undefined) return false;
        v.which = v.which.label ?? v.which;
        v.index = names.indexOf(v.which) + 1;
      }
      v.name = await ui.text({ label: ui.t('Enter name for data set:'), def: 'Dataset', validate: s => isSyntactic(s.trim()) ? undefined : ui.t('Enter a valid R name.') });
      return Boolean(v.name);
    },
    // foreign cannot read version 8 transport files; haven can.
    code: v => [`.Datasets <- tryCatch(foreign::read.xport("${v.file}"), error = function(e) as.data.frame(haven::read_xpt("${v.file}")))`,
      v.index ? `${v.name.trim()} <- .Datasets[[${v.index}]]` : `${v.name.trim()} <- .Datasets`,
      `colnames(${v.name.trim()}) <- tolower(colnames(${v.name.trim()}))`, 'remove(.Datasets)'].join('\n') },
  importSASb7dat: { ds: false, activeDataset: v => v.name,
    fields: [dsEntry('Enter name for data set:  '), check('factors', 'Convert character variables to factors', true),
      check('rownames', 'First column contains row names')],
    async after(v, ui) {
      v.file = await pickFile(ui, 'Select the SAS b7dat file', { 'SAS b7dat dataset': ['sas7bdat', 'SAS7BDAT'], 'All Files': ['*'] });
      return Boolean(v.file);
    },
    code: v => `${v.name} <- readSAS("${v.file}", stringsAsFactors=${rbool(v.factors.factors)}, rownames=${rbool(v.rownames.rownames)})` },
  importMinitab: { ds: false, activeDataset: v => v.name,
    fields: [dsEntry()],
    async after(v, ui) {
      v.file = await pickFile(ui, 'Select the Minitab file', { 'Minitab portable files': ['mtp', 'MTP'], 'All Files': ['*'] });
      return Boolean(v.file);
    },
    code: v => `${v.name} <- as.data.frame(foreign::read.mtp("${v.file}"))` },
  importSTATA: { ds: false, activeDataset: v => v.name,
    fields: [dsEntry('Enter name for data set:  '), check('factors', 'Convert character variables to factors', true),
      check('dates', 'Convert dates to R format', true), check('rownames', 'First column contains row names')],
    async after(v, ui) {
      v.file = await pickFile(ui, 'Select the STATA file', { 'STATA datasets': ['dta', 'DTA'], 'All Files': ['*'] });
      return Boolean(v.file);
    },
    code: v => `${v.name} <- readStata("${v.file}", convert.dates=${rbool(v.dates.dates)}, stringsAsFactors=${rbool(v.factors.factors)}, rownames=${rbool(v.rownames.rownames)})` },
  importExcel: { ds: false, activeDataset: v => v.name,
    fields: [dsEntry('Enter name of data set: '), check('header', 'Variable names in first row of spreadsheet', true),
      check('rownames', 'Row names in first column of spreadsheet'), check('factors', 'Convert character data to factors', true),
      { k: 'na', type: 'text', optional: true, def: '<empty cell>', label: 'Missing data indicator:' }],
    async after(v, ui) {
      v.file = await pickFile(ui, 'Select the Excel file', { 'MS Excel file': ['xlsx', 'XLSX', 'xls', 'XLS'], 'All Files': ['*'] });
      if (!v.file) return false;
      const sheets = await ui.query(`readxl::excel_sheets(${rs(v.file)})`);
      v.sheet = sheets?.[0] || '1';
      if (sheets && sheets.length > 1) {
        const picked = await ui.pick(ui.t('Select one table'), sheets.map(label => ({ label })));
        if (picked === undefined) return false;
        v.sheet = picked.label ?? picked;
      }
      return true;
    },
    code: v => `${v.name} <- readXL("${v.file}", rownames=${rbool(v.rownames.rownames)}, header=${rbool(v.header.header)}, ` +
      `na="${v.na.trim() === '<empty cell>' ? '' : v.na}", sheet="${v.sheet}", stringsAsFactors=${rbool(v.factors.factors)})` },

  listDataSetsInPackages: { ds: false, code: () => 'data()' },
  readDataFromPackage: { ds: false,
    async after(v, ui) {
      const packages = await ui.query('sort(.packages())');
      const pkg = packages ? await ui.pick(ui.t('Package (Double-click to select)'), packages.map(label => ({ label }))) :
        await ui.text({ label: ui.t('Package name'), def: 'datasets' });
      if (pkg === undefined) return false;
      const pkgName = pkg.label ?? pkg;
      const items = await ui.query(`sub(" .*$", "", data(package = ${rs(pkgName)})$results[, "Item"])`);
      const item = items?.length ? await ui.pick(ui.t('Data set (Double-click to select)'), items.map(label => ({ label }))) :
        await ui.text({ label: ui.t('Enter name of data set:  ') });
      if (!item) return false;
      Object.assign(v, { pkg: pkgName, item: item.label ?? item });
      return true;
    },
    activeDataset: v => v.item,
    code: v => `data(${v.item}, package="${v.pkg}")` },

  // Data > Active data set > View data: as Rcmdr, variables and a subset; R's viewer shows it.
  viewData: { fields: [check('all', 'Include all variables', true), OR('or'),
      { k: 'vars', type: 'var', kind: 'any', multi: true, min: 0, label: 'Variables (select one or more)' },
      { k: 'expr', type: 'text', optional: true, def: '<all cases>', label: 'Subset expression', sample: 'n1 > 1' }],
    check: v => (!v.all.all && !v.vars.length ? 'No variables were selected.' : undefined),
    code(v, c) {
      const subset = v.expr.trim() && v.expr.trim() !== '<all cases>' ? `, subset=${v.expr.trim()}` : '';
      const select = v.all.all ? '' : `, select=c(${v.vars.join(',')})`;
      return !subset && !select ? `View(${c.ds})` : `View(subset(${c.ds}${subset}${select}), title = ${rs(c.ds)})`;
    } },
  // The toolbar button: show the whole data set right away.
  viewDataSet: { extraIn: 'toolbar', label: { en: 'View data set', es: 'Visualizar conjunto de datos' }, code: (v, c) => `View(${c.ds})` },
  selectActiveDataSet: { ds: false, select: 'dataset' },
  refreshActiveDataSet: { refresh: true },
  helpDataSet: { code: (v, c) => `help("${c.ds}")` },
  variablesDataSet: { code: (v, c) => `names(${c.ds})` },
  // The toolbar button: R's own spreadsheet-style editor in its own window.
  editDataSet: { extraIn: 'toolbar', label: { en: 'Edit data set', es: 'Editar conjunto de datos' }, code: (v, c) => `${c.ds} <- edit(${c.ds})` },
  editDataValue: { extraIn: 'activeMenu', label: { en: 'Edit one value...', es: 'Editar un valor...' },
    fields: [{ k: 'var', type: 'var', kind: 'any', label: 'Variable to edit' }, { k: 'row', type: 'num', int: true, min: 1, def: '1', label: 'Row number' },
      { k: 'value', type: 'text', label: 'New value (NA for missing)', def: 'NA' }],
    code(v, c) {
      const kind = c.kindOf(v.var);
      const value = v.value.trim() === 'NA' ? 'NA' : kind === 'numeric' && /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(v.value.trim()) ? v.value.trim()
        : kind === 'logical' && /^(TRUE|FALSE)$/.test(v.value.trim()) ? v.value.trim() : rs(v.value);
      return `${c.ds}[${v.row}, ${rs(v.var)}] <- ${value}`;
    } },

  setCaseNames: { fields: [{ k: 'var', type: 'var', kind: 'any', label: 'Select variable containing row names' }],
    code: (v, c) => `row.names(${c.ds}) <- as.character(${c.ds}$${v.var})\n${c.ds}$${v.var} <- NULL` },
  subsetDataSet: { activeDataset: (v, c) => v.name.trim() === SAME ? undefined : v.name.trim(),
    fields: [check('all', 'Include all variables', true), OR('or'),
      { k: 'vars', type: 'var', kind: 'any', multi: true, min: 0, label: 'Variables (select one or more)' },
      { k: 'expr', type: 'text', optional: true, label: 'Subset expression', def: '<all cases>' },
      newDataSetName()],
    check: v => (!v.all.all && !v.vars.length ? 'No variables were selected.'
      : v.all.all && (!v.expr.trim() || v.expr.trim() === '<all cases>') ? 'New data set same as active data set.' : undefined),
    code(v, c) {
      const cases = v.expr.trim() && v.expr.trim() !== '<all cases>' ? `, subset=${v.expr.trim()}` : '';
      const select = v.all.all ? '' : `, select=c(${v.vars.join(',')})`;
      return `${targetOf(v, c)} <- subset(${c.ds}${cases}${select})`;
    } },
  sortDataSet: { activeDataset: v => v.name.trim() === SAME ? undefined : v.name.trim(),
    fields: [{ k: 'vars', type: 'var', kind: 'any', multi: true, label: 'Sort Keys (select one or more)' },
      { k: 'direction', type: 'choice', label: 'Sort Direction', choices: [['FALSE', 'Increasing'], ['TRUE', 'Decreasing']] },
      newDataSetName()],
    // With several keys Rcmdr asks their order ("Reorder Sort Keys").
    async after(v, ui) {
      if (v.vars.length < 2) return true;
      const order = [];
      for (const [i, key] of v.vars.entries()) {
        const n = await ui.text({ label: `${ui.t('Order')}: ${key}`, def: String(i + 1),
          validate: s => /^\d+$/.test(s.trim()) && Number(s) >= 1 && Number(s) <= v.vars.length ? undefined : ui.t('Use each number from 1 to {0} exactly once.', v.vars.length) });
        if (n === undefined) return false;
        order.push(Number(n));
      }
      if (new Set(order).size !== order.length) {
        await ui.vscode.window.showWarningMessage(ui.t('Use each number from 1 to {0} exactly once.', v.vars.length));
        return false;
      }
      v.vars = v.vars.map((key, i) => [order[i], key]).sort((a, b) => a[0] - b[0]).map(p => p[1]);
      return true;
    },
    code: (v, c) => `${targetOf(v, c)} <- with(${c.ds}, ${c.ds}[order(${v.vars.join(', ')}, decreasing=${v.direction}), ])` },
  Aggregate: { activeDataset: v => v.name,
    fields: [{ k: 'name', type: 'name', label: 'Name for aggregated data set:  ', def: 'AggregatedData' },
      { k: 'xs', type: 'var', kind: 'any', multi: true, label: 'Variables to aggregate\n(pick one or more)' },
      { k: 'gs', type: 'var', kind: 'factor', multi: true, label: 'Aggregate by\n(pick one or more)' },
      { k: 'fun', type: 'choice', label: 'Statistic', choices: [['mean', 'Mean'], ['sum', 'Sum'], ['other', 'Other (specify)  ']] },
      { k: 'funOther', type: 'text', label: '', prompt: 'Other (specify)  ', def: '', optional: true, sample: 'median', when: v => v.fun === 'other' }],
    check: v => (v.gs.some(g => v.xs.includes(g)) ? 'Variables to aggregate and those to aggregate by must be different.'
      : v.fun === 'other' && !v.funOther.trim() ? 'A value is required.' : undefined),
    code: (v, c) => `${v.name}<- aggregate(${v.xs.length > 1 ? `cbind(${v.xs.join(', ')})` : v.xs[0]} ~ ${v.gs.join(' + ')}, data=${c.ds}, FUN=${v.fun === 'other' ? v.funOther.trim() : v.fun})` },
  SelectRows: { activeDataset: v => v.name.trim() === SAME ? undefined : v.name.trim(),
    fields: [{ k: 'rows', type: 'text', label: 'Indices or names of row(s) to select', def: '' }, newDataSetName()],
    code: (v, c) => `${targetOf(v, c)} <- ${c.ds}[rownames(${c.ds}) %in% ${caseList(v.rows)}, ${c.nvars === 1 ? ', drop = FALSE' : ''}]` },
  RemoveRows: { activeDataset: v => v.name.trim() === SAME ? undefined : v.name.trim(),
    fields: [{ k: 'rows', type: 'text', label: 'Indices or names of row(s) to remove', def: '' }, newDataSetName()],
    code: (v, c) => `${targetOf(v, c)} <- ${c.ds}[!(rownames(${c.ds}) %in% ${caseList(v.rows)}),]` },
  Stack: { activeDataset: v => v.name,
    fields: [{ k: 'xs', type: 'var', kind: 'numeric', multi: true, min: 2, label: 'Variables (pick two or more)' },
      { k: 'name', type: 'name', label: 'Name for stacked data set:', def: 'StackedData' },
      { k: 'values', type: 'name', label: 'Name for variable:', def: 'variable' },
      { k: 'ind', type: 'name', label: 'Name for factor:', def: 'factor' }],
    code: (v, c) => `${v.name} <- stack(${c.ds}[, ${quoted(v.xs)}])\nnames(${v.name}) <- c("${v.values}", "${v.ind}")` },
  filterNA: { activeDataset: v => v.name.trim() === SAME ? undefined : v.name.trim(),
    fields: [check('all', 'Include all variables', true), OR('or'),
      { k: 'vars', type: 'var', kind: 'any', multi: true, min: 0, label: 'Variables (select one or more)' }, newDataSetName()],
    check: v => (!v.all.all && !v.vars.length ? 'No variables were selected.' : undefined),
    code: (v, c) => v.all.all ? `${targetOf(v, c)} <- na.omit(${c.ds})` : `${targetOf(v, c)} <- na.omit(${c.ds}[,${quoted(v.vars)}])` },
  reshapeLong2Wide: { activeDataset: v => (v.active.active ? v.name : undefined),
    fields: [{ k: 'name', type: 'name', label: 'Name for wide data set: ', def: c => `${c.ds}Wide` },
      check('active', 'Make the wide data set active', true),
      { k: 'id', type: 'var', kind: 'any', label: 'Subject ID variable (pick one)' },
      { k: 'within', type: 'var', kind: 'factor', multi: true, exclude: ['id'], label: 'Within-subjects factors (pick one or more)' },
      { k: 'varying', type: 'var', kind: 'any', multi: true, exclude: ['id', 'within'], label: 'Variables that vary by occasion (pick one or more)' },
      { k: 'ignore', type: 'var', kind: 'any', multi: true, min: 0, exclude: ['id', 'within', 'varying'], label: 'Variables to ignore (pick zero or more)' }],
    check(v) {
      const all = [v.id, ...v.within, ...v.varying, ...v.ignore];
      return all.some((x, i) => all.indexOf(x) !== i) ? 'The following variables appear more than once' : undefined;
    },
    code(v, c) {
      const list = xs => (xs.length > 1 ? `c(${xs.map(x => `"${x}"`).join(', ')})` : `"${xs[0]}"`);
      const ignore = v.ignore.length ? (v.ignore.length > 1 ? `, ignore=${list(v.ignore)}` : `, ignore="${v.ignore[0]}"`) : '';
      return `${v.name} <- reshapeL2W(${c.ds}, within=${list(v.within)}, id="${v.id}", varying=${list(v.varying)}${ignore})`;
    } },
  // The three tabs of Rcmdr's dialog: one repeated-measures factor (8 levels), two (5 x 5) and options.
  reshapeWide2Long: { activeDataset: v => (v.active.active ? v.name : undefined),
    fields: [
      { k: 'tab', type: 'choice', label: '', prompt: 'Reshape Data Set from Wide to Long Format', choices: [['one', 'One Repeated-Measures Factor'], ['two', 'Two Repeated-Measures Factors']] },
      { k: 'wsfactor', type: 'name', label: 'Name for the within-subjects factor: ', def: 'trials', when: v => v.tab === 'one' },
      { k: 'note1', type: 'note', label: 'Specify up to 8 levels (responses) and level names for the within-subjects factor', when: v => v.tab === 'one' },
      ...Array.from({ length: 8 }, (_, i) => [
        { k: `level${i + 1}`, type: 'text', label: '', prompt: `Level-${i + 1}`, def: `Level-${i + 1}`, compact: true, when: v => v.tab === 'one' },
        { k: `rm${i + 1}`, type: 'var', kind: 'numeric', optional: true, compact: true, label: '', prompt: `Level-${i + 1}`, when: v => v.tab === 'one' }]).flat(),
      { k: 'rowfactor', type: 'name', label: 'Name for the within-subjects row factor: ', def: 'RowFactor', when: v => v.tab === 'two' },
      { k: 'colfactor', type: 'name', label: 'Name for the within-subjects column factor: ', def: 'ColumnFactor', when: v => v.tab === 'two' },
      { k: 'note2', type: 'note', label: 'Specify up to 5 levels and level names for each within-subjects factor', when: v => v.tab === 'two' },
      ...Array.from({ length: 5 }, (_, j) => ({ k: `col${j + 1}`, type: 'text', label: '', prompt: `Column-${j + 1}`, def: `Column-${j + 1}`, compact: true, when: v => v.tab === 'two' })),
      ...Array.from({ length: 5 }, (_, i) => [
        { k: `row${i + 1}`, type: 'text', label: '', prompt: `Row-${i + 1}`, def: `Row-${i + 1}`, compact: true, when: v => v.tab === 'two' },
        ...Array.from({ length: 5 }, (_, j) => ({ k: `rm${i + 1}${j + 1}`, type: 'var', kind: 'numeric', optional: true, compact: true, label: '', prompt: `Row-${i + 1} × Column-${j + 1}`, when: v => v.tab === 'two' }))]).flat(),
      { k: 'name', type: 'name', label: 'Name for long data set: ', def: c => `${c.ds}Long` },
      { k: 'response', type: 'name', label: 'Response variable: ', def: 'response' },
      { k: 'id', type: 'name', label: 'Subject ID variable: ', def: 'id' },
      check('active', 'Make the wide data set active', true),
      { k: 'ignore', type: 'var', kind: 'any', multi: true, min: 0, label: 'Variables to ignore (pick zero or more)' }],
    check(v) {
      if (v.tab === 'one') {
        const picked = Array.from({ length: 8 }, (_, i) => v[`rm${i + 1}`]);
        const n = picked.filter(Boolean).length;
        if (n < 2 || picked.slice(0, n).some(x => !x)) return 'You must select at least two responses, in consecutive levels.';
        return undefined;
      }
      const grid = Array.from({ length: 5 }, (_, i) => Array.from({ length: 5 }, (_, j) => Boolean(v[`rm${i + 1}${j + 1}`])));
      const rows = grid.filter(r => r.some(Boolean)).length, cols = Math.max(0, ...grid.map(r => r.lastIndexOf(true) + 1));
      if (rows < 2 || cols < 2 || grid.some((r, i) => r.some((x, j) => x !== (i < rows && j < cols)))) return 'Responses must fill a rectangle of at least two rows and two columns, starting at the top left.';
      return undefined;
    },
    code(v, c) {
      const ignore = v.ignore.length ? (v.ignore.length > 1 ? `, ignore=c(${v.ignore.map(x => `"${x}"`).join(', ')})` : `, ignore="${v.ignore[0]}"`) : '';
      const q = xs => xs.map(x => `"${x}"`).join(', ');
      if (v.tab === 'one') {
        const rms = Array.from({ length: 8 }, (_, i) => v[`rm${i + 1}`]).filter(Boolean);
        const levels = rms.map((_, i) => v[`level${i + 1}`]);
        return `${v.name} <- reshapeW2L(${c.ds}, within="${v.wsfactor}", levels=list(${v.wsfactor}=c(${q(levels)})), varying=list(${v.response}=c(${q(rms)}))${ignore}, id="${v.id}")`;
      }
      const rows = Array.from({ length: 5 }, (_, i) => i).filter(i => v[`rm${i + 1}1`]);
      const cols = Array.from({ length: 5 }, (_, j) => j).filter(j => v[`rm1${j + 1}`]);
      const res = rows.flatMap(i => cols.map(j => v[`rm${i + 1}${j + 1}`]));
      return `${v.name} <- reshapeW2L(${c.ds}, within=c("${v.rowfactor}", "${v.colfactor}"), levels=list(${v.rowfactor}=c(${q(rows.map(i => v[`row${i + 1}`]))}), ` +
        `${v.colfactor}=c(${q(cols.map(j => v[`col${j + 1}`]))})), varying=list(${v.response}=c(${q(res)}))${ignore}, id="${v.id}")`;
    } },
  convertStrings2Factors: { code: (v, c) => `${c.ds} <- strings2factors(${c.ds})` },
  saveDataSet: {
    async after(v, ui) {
      v.file = await pickFile(ui, 'Save the active data set as', { 'R Data Files': ['RData', 'rda', 'Rda', 'RDA'], 'All Files': ['*'] }, 'save', `${ui.ctx.ds}.RData`);
      return Boolean(v.file);
    },
    code: (v, c) => `save("${c.ds}", file="${v.file}")` },
  exportDataSet: {
    fields: [{ k: 'opts', type: 'flags', label: '', items: [['colnames', 'Write variable names', true], ['rownames', 'Write row names', true], ['quotes', 'Quotes around character values', true]] },
      { k: 'na', type: 'text', label: 'Missing values:  ', def: 'NA' },
      { k: 'delimiter', type: 'choice', label: 'Field Separator', choices: [['spaces', 'Spaces'], ['tabs', 'Tabs'], ['commas', 'Commas [,]'], ['semicolons', 'Semicolons [;]'], ['other', 'Other']] },
      { k: 'other', type: 'text', label: 'Specify:', def: '', optional: true, when: v => v.delimiter === 'other' }],
    async after(v, ui) {
      const ext = v.delimiter === 'commas' ? 'csv' : 'txt';
      v.file = await pickFile(ui, 'Export the active data set to', { 'Text Files': ['txt', 'TXT', 'dat', 'DAT', 'csv', 'CSV'], 'All Files': ['*'] }, 'save', `${ui.ctx.ds}.${ext}`);
      return Boolean(v.file);
    },
    code(v, c) {
      const sep = { tabs: '\\t', spaces: ' ', commas: ',', semicolons: ';' }[v.delimiter] ?? v.other.trim();
      // As Rcmdr: with both names, col.names=NA leaves the corner cell empty.
      const col = v.opts.colnames && v.opts.rownames ? 'NA' : rbool(v.opts.colnames);
      return `write.table(${c.ds}, "${v.file}", sep="${sep}", col.names=${col}, row.names=${rbool(v.opts.rownames)}, quote=${rbool(v.opts.quotes)}, na="${v.na}")`;
    } },

  RecodeDialog: {
    fields: [{ k: 'vars', type: 'var', kind: 'any', multi: true, label: 'Variables to recode (pick one or more)' },
      { k: 'name', type: 'text', label: 'New variable name or prefix for multiple recodes: ', def: 'variable' },
      check('factor', 'Make (each) new variable a factor', true),
      { k: 'to', type: 'text', label: 'Old/new values assignment character(s)  ', def: '=', compact: true },
      { k: 'interval', type: 'text', label: 'Recode interval character(s)  ', def: ':', compact: true },
      { k: 'separator', type: 'text', label: 'Recode separator character(s)  ', def: ';', compact: true },
      { k: 'rules', type: 'text', label: 'Enter recode directives', def: '' }],
    check: v => (!v.rules.split(v.separator || ';').join('').trim() ? 'No recode directives specified.'
      : v.rules.includes("'") ? 'Use only double-quotes (" ") in recode directives' : undefined),
    code(v, c) {
      const sep = v.separator;
      // Rcmdr's processRecode(): "1,2 = x" becomes "c(1,2) = x".
      const directives = v.rules.replace(/\n/g, `${sep} `).split(sep).map(r => {
        const parts = r.split('=');
        return /,/.test(parts[0]) ? `c(${parts[0]}) = ${parts[1]}` : parts.join('=');
      }).join(sep).replace(new RegExp(` *${sep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} *$`), '');
      const multiple = v.vars.length > 1;
      const lines = [...v.vars].reverse().map(x => `\n  ${multiple ? v.name.trim() + x : v.name.trim()} <- Recode(${x}, '${directives}', as.factor=${rbool(v.factor.factor)}, ` +
        `to.value="${v.to}", interval="${v.interval}", separator="${sep}")`);
      return `${c.ds} <- within(${c.ds}, {${lines.join('')}\n})`;
    } },
  Compute: {
    fields: [{ k: 'vars', type: 'var', kind: 'any', optional: true, label: 'Current variables (double-click to expression)' },
      { k: 'name', type: 'name', label: 'New variable name', def: 'variable' },
      { k: 'expr', type: 'text', label: 'Expression to compute', def: '' }],
    code: (v, c) => `${c.ds}$${v.name} <- with(${c.ds}, ${v.expr.trim()})` },
  addObsNumbers: { code: (v, c) => `${c.ds}$ObsNumber <- 1:${c.nrows ?? `nrow(${c.ds})`}` },
  standardize: { fields: [{ k: 'vars', type: 'var', kind: 'numeric', multi: true, label: 'Variables (pick one or more)' }],
    code: (v, c) => `${c.ds} <- local({\n  .Z <- scale(${c.ds}[,${quoted(v.vars)}])\n  within(${c.ds}, {` +
      v.vars.map((x, i) => [x, i]).reverse().map(([x, i]) => `\n    Z.${x} <- .Z[,${i + 1}]`).join('') + ' \n  })\n})' },
  numericToFactor: {
    fields: [{ k: 'vars', type: 'var', kind: 'numeric', multi: true, label: 'Variables (pick one or more)' },
      { k: 'levels', type: 'choice', label: 'Factor Levels', choices: [['names', 'Supply level names'], ['numbers', 'Use numbers']] },
      { k: 'name', type: 'text', label: 'New variable name or prefix for multiple variables:  ', def: '<same as variables>' }],
    // "Level Names for ...": one name per value (once for all when they share their values).
    async after(v, ui) {
      v.labels = {};
      if (v.levels !== 'names') return true;
      const valuesOf = {};
      for (const n of v.vars) valuesOf[n] = await ui.query(`as.character(sort(unique(${ui.ctx.ds}$${n})))`) || [];
      const same = v.vars.length === 1 || v.vars.every(n => JSON.stringify(valuesOf[n]) === JSON.stringify(valuesOf[v.vars[0]]));
      for (const n of same ? [v.vars[0]] : v.vars) {
        const names = [];
        for (const value of valuesOf[n]) {
          const text = await ui.text({ label: `${ui.t('Level Names for')} ${same && v.vars.length > 1 ? 'Factors' : n} — ${ui.t('Numeric value')} ${value}: ${ui.t('Level name')}`, def: '',
            validate: s => s.trim() ? undefined : ui.t('A value is required.') });
          if (text === undefined) return false;
          names.push(text.trim());
        }
        for (const m of same ? v.vars : [n]) v.labels[m] = names;
      }
      return true;
    },
    code(v, c) {
      const fname = x => (v.name.trim() === '<same as variables>' ? x : v.vars.length === 1 ? v.name.trim() : v.name.trim() + x);
      return `${c.ds} <- within(${c.ds}, {` + v.vars.map(x => `\n  ${fname(x)} <- ` +
        (v.levels === 'names' ? `factor(${x}, labels=c(${v.labels[x].map(l => `'${l}'`).join(',')}))` : `as.factor(${x})`)).join('') + '\n})';
    } },
  characterToFactor: {
    fields: [{ k: 'vars', type: 'var', kind: 'character', multi: true, label: 'Variables (pick one or more)' },
      { k: 'name', type: 'text', label: 'New variable name or prefix for multiple variables:  ', def: '<same as variables>' }],
    code(v, c) {
      const fname = x => (v.name.trim() === '<same as variables>' ? x : v.vars.length === 1 ? v.name.trim() : v.name.trim() + x);
      return `${c.ds} <- within(${c.ds}, {` + v.vars.map(x => `\n  ${fname(x)} <- as.factor(${x})`).join('') + '\n})';
    } },
  binVariable: {
    fields: [{ k: 'x', type: 'var', kind: 'numeric', label: 'Variable to bin (pick one)' },
      { k: 'name', type: 'name', label: 'New variable name', def: 'variable' },
      { k: 'bins', type: 'num', int: true, min: 2, max: 20, def: '3', label: 'Number of bins:' },
      { k: 'levels', type: 'choice', label: 'Level Names', choices: [['specify', 'Specify names'], ['numbers', 'Numbers'], ['ranges', 'Ranges']] },
      { k: 'method', type: 'choice', label: 'Binning Method', choices: [['intervals', 'Equal-width bins'], ['proportions', 'Equal-count bins'], ['natural', 'Natural breaks\n(from K-means clustering)']] }],
    // "Bin Names": a name for each bin, 1 to n by default.
    async after(v, ui) {
      if (v.levels !== 'specify') return true;
      v.names = [];
      for (let i = 1; i <= Number(v.bins); i++) {
        const text = await ui.text({ label: `${ui.t('Bin Names')} — ${ui.t('Bin')} ${i}: ${ui.t('Name')}`, def: String(i) });
        if (text === undefined) return false;
        v.names.push(text.trim());
      }
      return true;
    },
    code(v, c) {
      const labels = v.levels === 'numbers' ? 'FALSE' : v.levels === 'ranges' ? 'NULL' : `c('${v.names.join("','")}')`;
      return `${c.ds}$${v.name} <- with(${c.ds}, binVariable(${v.x}, bins=${v.bins}, method='${v.method}', labels=${labels}))`;
    } },
  reorderFactor: {
    fields: [{ k: 'f', type: 'var', kind: 'factor', label: 'Factor (pick one)' },
      { k: 'name', type: 'text', label: 'Name for factor', def: '<same as original>' },
      check('ordered', 'Make ordered factor'),
      { k: 'order', type: 'levelorder', of: 'f', label: 'Reorder Levels' }],
    code: (v, c) => `${c.ds}$${v.name.trim() === '<same as original>' ? v.f : v.name.trim()} <- with(${c.ds}, factor(${v.f}, levels=c(${v.order.map(l => `'${l}'`).join(',')})${v.ordered.ordered ? ', ordered=TRUE' : ''}))` },
  dropUnusedFactorLevels: {
    fields: [check('all', 'all factors'), { k: 'or', type: 'note', label: 'OR' },
      { k: 'vars', type: 'var', kind: 'realfactor', multi: true, min: 0, label: 'Factors(s) to drop levels (pick one or more)' }],
    check: v => (!v.all.all && !v.vars.length ? 'No factors selected.' : undefined),
    code: (v, c) => v.all.all ? `${c.ds} <- droplevels(${c.ds})`
      : `${c.ds} <- within(${c.ds}, {` + v.vars.map(x => `\n  ${x} <- droplevels(${x})`).join('') + ' \n})' },
  setContrasts: {
    fields: [{ k: 'f', type: 'var', kind: 'factor', label: 'Factor (pick one)' },
      { k: 'type', type: 'choice', label: 'Contrasts', choices: [['contr.Treatment', 'Treatment (dummy) contrasts'], ['contr.Sum', 'Sum (deviation) contrasts'], ['contr.helmert', 'Helmert contrasts'], ['contr.poly', 'Polynomial contrasts'], ['specify', 'Other (specify)']] },
      { k: 'matrix', type: 'matrix', of: 'f', label: 'Enter Contrast Coefficients', when: v => v.type === 'specify' }],
    code(v, c) {
      if (v.type !== 'specify') return `contrasts(${c.ds}$${v.f}) <- "${v.type}"`;
      const n = v.matrix.levels.length, k = n - 1;
      const byColumn = Array.from({ length: k }, (_, j) => v.matrix.rows.map(r => r[j])).flat();
      return [`.Contrasts <- matrix(c(${byColumn.join(',')}), ${n}, ${k})`,
        `colnames(.Contrasts) <- c(${Array.from({ length: k }, (_, j) => `'.${j + 1}'`).join(', ')})`,
        `contrasts(${c.ds}$${v.f}) <- .Contrasts`].join('\n');
    } },
  renameVariables: {
    fields: [{ k: 'vars', type: 'var', kind: 'any', multi: true, label: 'Variables (pick one or more)' }],
    // "Variable Names": a new name for each one.
    async after(v, ui) {
      v.newnames = [];
      for (const old of v.vars) {
        const text = await ui.text({ label: `${ui.t('Variable Names')} — ${ui.t('Old Name')}: ${old}. ${ui.t('New name')}:`, def: '',
          validate: s => isSyntactic(s.trim()) ? undefined : ui.t('Enter a valid R name.') });
        if (text === undefined) return false;
        v.newnames.push(text.trim());
      }
      return true;
    },
    code(v, c) {
      const all = c.varNames || [];
      const which = v.vars.map(x => all.indexOf(x) + 1);
      return `names(${c.ds})[c(${which.join(',')})] <- c(${v.newnames.map(n => `"${n}"`).join(',')})`;
    } },
  deleteVariable: { fields: [{ k: 'vars', type: 'var', kind: 'any', multi: true, label: 'Variable(s) to delete (pick one or more)' }],
    code: (v, c) => `${c.ds} <- within(${c.ds}, {` + v.vars.map(x => `\n  ${x} <- NULL`).join('') + ' \n})' }
};

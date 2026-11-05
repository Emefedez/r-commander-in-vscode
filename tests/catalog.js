// Drives every command through the real Commander/Dialog code with a scripted
// fake VS Code, then runs the generated R in a real R session.
require('./headless');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { RSession } = require('../lib/rsession');
const { Commander } = require('../lib/commander');
const catalog = require('../catalog');
const model = require('../lib/formmodel');

const root = path.join(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rcp-test-'));
const fixtures = path.join(tmp, 'fixtures');
// A tiny CRAN-like repository and a library of its own, so the package installer is tested offline
// and never touches the real library: R_LIBS makes that library the first one every R below sees.
const repoDir = path.join(tmp, 'repo-fixture');
spawnSync('Rscript', [path.join(__dirname, 'make-repo.R'), repoDir], { encoding: 'utf8' });
process.env.R_LIBS = path.join(repoDir, 'lib');
const cranMirror = `file://${path.join(repoDir, 'repo')}`;
spawnSync('Rscript', [path.join(__dirname, 'make-fixtures.R'), fixtures], { encoding: 'utf8' });
// Real files for the commands that open one. Pass A uses the files only haven can read where there
// are two (so the fallback runs), pass B the ones foreign reads directly.
const fixtureFor = (title, pass) => {
  const pick = (a, b) => path.join(fixtures, pass === 'A' ? a : b);
  if (/SPSS/i.test(title)) return pick('iris.sav', 'electric.sav');
  if (/SAS xport/i.test(title)) return pick('small.xpt', 'small8.xpt');
  if (/b7dat/i.test(title)) return pick('iris.sas7bdat', 'iris.sas7bdat');
  if (/STATA/i.test(title)) return pick('iris.dta', 'small.dta');
  if (/Excel/i.test(title)) return path.join(fixtures, 'datasets.xlsx');
  if (/package archive/i.test(title)) return path.join(repoDir, 'rcptest_1.1.tar.gz');
  if (/file to load/i.test(title)) return path.join(fixtures, 'two-frames.RData');
  return path.join(fixtures, pass === 'A' ? 'small.tsv' : 'small.csv');
};
const runnerR = path.join(root, 'runner.R');
const setupR = path.join(__dirname, 'setup.R');

// Real R answers the queries, so snapshot parsing is tested too.
class TestSession extends RSession {
  constructor() { super(null, runnerR); this.records = []; this.n = 0; }
  // Runs the exact command the extension sends to the terminal, in a fresh R
  // process with the test data loaded, and reads the file R writes.
  async query(expr) {
    const file = path.join(tmp, `q-${++this.n}.txt`);
    const script = `suppressMessages(source(${JSON.stringify(setupR)}))\n${this.queryCommand(expr, file)}`;
    const out = spawnSync('Rscript', ['-e', script], { encoding: 'utf8' });
    if (out.status !== 0 || !fs.existsSync(file)) return undefined;
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    if (lines[lines.length - 1] === '') lines.pop();
    return lines;
  }
  async run(code, opts) { this.records.push({ code, pkgs: opts.require || [] }); }
}

const ANSWERS = [ // prompt substring -> typed answer
  ['Bin Names', 'low,mid,high'],
  ['Probabilities', '0.25, 0.5'], ['From (>)', '-1'], ['To (<=)', '1'],
  ['Expression to compute', 'n1 + n2'], ['Random effects', '(1 | f3)'], ['Expression using these coefficient names', 'n2 / n3'], ['Expression in the coefficient names', 'n2 / n3'],
  ['Hypotheses separated', 'n2 = 0'], ['Names for the 3 bins', 'low, mid, high'], ['Subset expression', 'n1 > 1'],
  ['Right-hand side of the variance formula', 'n2'], ['Package names', 'car'], ['Name of the new variable', 'newvar'],
  ['Values of', '1, 2, 3'], ['URL of the data file', `file://${path.join(fixtures, 'small.csv')}`], ['Name of the data set in the R session', 'Dataset'],
  ['Name of the model in the R session', 'RegModel.1'], ['Package name', 'datasets'], ['Data set name', 'iris'],
  ['Rows to remove', '1, 2'], ['Rows to select', '1:10'], ['Variable names separated', 'u, w'],
  ['Internet URL', `file://${path.join(fixtures, 'small.csv')}`], ['row(s) to select', '1 2 3'], ['row(s) to remove', '1 2'],
  ['Enter recode directives', '"a" = "A"; else = "B"'], ['Other (specify)', 'median'], ['Expression to evaluate', 'b1/b2'], ['Shape 1', '2'], ['Shape 2', '3'], ['Shape', '2'], ['Degrees of freedom', '5'], ['degrees of freedom', '5'], ['Binomial trials', '10'], ['Variable value(s)', '1, 2'], ['Known variance value', '4'], ['Known mean value', '1'], ['Sigma^2_', '2'], ['Specify:', ',']
];
// single-pick overrides: command id -> { prompt substring: label }
const PICKS = (pass) => ({
  Deflation: { 'Base variable': 'period', basevar: 'period' }, Sindexnumbers: { 'Base variable': 'period', basevar: 'period' },
  BCindexnumbers: { 'Base variable': 'period', basevar: 'period' },
  DgenericDistrDefine: pass === 'A' ? { proba: '0.2, 0.3, 0.5', Probabilities: '0.2, 0.3, 0.5' } : { proba: '0.2, 0.5, 1', Probabilities: '0.2, 0.5, 1' },
  Cindexnumbers: { means: { arithmetic: true, geometric: true, harmonic: false }, 'Aggregation Method': ['Arithmetic', 'Geometric'] },
  Pindexnumbers: { 'Base variable': 'period2', basevar: 'period2', 'Product variable': 'prod', prod: 'prod' }, generalizedLinearModel: { lhs: pass === 'A' ? 'f2b' : 'n3' },
  generalizedLinearMixedModel: { lhs: pass === 'A' ? 'f2b' : 'n3', rhs: 'n1 + (1 | f3)', family: pass === 'A' ? 'binomial' : 'poisson', 'Family (double-click': pass === 'A' ? 'binomial' : 'poisson' },
  linearMixedModel: { rhs: 'n2 + (1 | f3)' },
  multinomialLogitModel: { lhs: 'f3' }, ordinalRegressionModel: { lhs: 'f3' },
  hierarchicalCluster: { distance: 'euc2', 'Distance Measure': 'Squared-Euclidian' },
  linearRegressionModel: { 'Response variable': 'n5' },
  Xyplot: { cond: ['f3'], grp: ['f2'], "Conditions '|'": ['f3'], "Groups 'groups='": ['f2'] },
  boxPlot: pass === 'A' ? { g: '', 'Plot by groups': '(none)' } : { ys: ['n1'], 'Variable (pick one or more)': ['n1'], g: 'f3', 'Plot by groups': 'f3' },
  QQPlot: { df: '5', chisqdf: '3', fdf1: '3', fdf2: '20', othername: 'exp', otherparam: 'rate=1', 'df = ': '5', 'Numerator df': '3', 'Denominator df': '20', 'Specify: ': 'exp', 'Parameters: ': 'rate=1' },
  BartlettTest: { gs: ['f2', 'f3'], 'Factors (pick one or more)': ['f2', 'f3'] }, factorAnalysis: { subset: '<all valid cases>', 'Subset expression': '<all valid cases>' },
  // Repeated measures: three levels (or a 2 x 2 grid), the rest left empty.
  oneWayRepeatedMeasures: Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].flatMap(i => [[`rm${i}`, i <= 3 ? `n${i}` : ''], [`Level-${i}`, i <= 3 ? `n${i}` : '(none)']])),
  twoWayRepeatedMeasures: Object.fromEntries([1, 2, 3, 4, 5].flatMap(i => [1, 2, 3, 4, 5].flatMap(j => {
    const v = i <= 2 && j <= 2 ? `n${(i - 1) * 2 + j}` : '';
    return [[`rm${i}${j}`, v], [`Row-${i} × Column-${j}`, v || '(none)']];
  }))),
  mergeDataSets: { 'First Data Set': 'Dataset', 'Second Data Set': 'Other' },
  compareModels: { m1: 'RegModel.1', m2: 'GLM.1', 'First model': 'RegModel.1', 'Second model': 'GLM.1' },
  readDataFromPackage: { 'Package (Double-click': 'datasets', 'Data set (Double-click': 'iris' }
});

function fakeVscode(pass, id, log) {
  const picks = PICKS(pass)[id] || {};
  const choose = (items, placeholder) => {
    // Two different groups; the second one is the second level.
    if (/Group 2/.test(String(placeholder))) return items[1] || items[0];
    if (/Group 1/.test(String(placeholder))) return items[0];
    const key = Object.keys(picks).find(k => String(placeholder).includes(k));
    if (key) return items.find(i => i.label === picks[key]) || items[0];
    // Commands with a cross-field check need a real variable, not "(none)".
    if (catalog[id]?.check && items[0]?.name !== undefined && typeof items[0].name !== 'string' && items[1]) return items[1];
    // The CRAN mirror is always the first line: the test repository, never a real mirror.
    if (/CRAN mirror/.test(String(placeholder))) return items[0];
    const real = items.filter(i => i.name !== undefined ? typeof i.name === 'string' : true);
    if (pass === 'B' && items[0]?.name !== undefined && typeof items[0].name !== 'string' && items[1]) return items[1];
    if (pass === 'B' && 'value' in items[0]) return items[items.length - 1];
    return items[0];
  };
  return {
    ConfigurationTarget: {}, Uri: { parse: u => ({ u }), joinPath: () => undefined },
    commands: { executeCommand: async (...a) => log.push(['command', ...a]) },
    env: { clipboard: { readText: async () => 'a b\n1 2\n3 4' }, openExternal: async u => log.push(['open', u]) },
    workspace: { workspaceFolders: undefined },
    window: {
      showQuickPick: async (items, opts) => {
        if (opts.canPickMany) {
          const many = PICKS(pass)[id] || {}, mk = Object.keys(many).find(k => Array.isArray(many[k]) && String(opts.placeHolder).includes(k));
          if (mk) return items.filter(i => many[mk].includes(i.label));
          if (items[0]?.key !== undefined) return items.filter(i => i.picked);
          if (/loading on factor [2-9]/.test(opts.placeHolder)) return []; // later CFA factors are left undefined
          const k = Math.min(items.length, /pick (one or )?two\)/.test(opts.placeHolder) ? 2 : 4);
          return items.slice(0, k).map(i => ({ ...i }));
        }
        return choose(items, opts.placeHolder);
      },
      showInputBox: async opts => {
        const hit = ANSWERS.find(([k]) => String(opts.prompt).includes(k));
        if (/No\. (successes|failures)/.test(String(opts.prompt))) return pass === 'B' ? '12' : '';
        if (String(opts.prompt).includes('one number per level')) {
          const levels = String(opts.prompt).match(/\(([^)]*)\)\s*$/)[1].split(', ');
          const j = Number(String(opts.prompt).match(/Contrast (\d+)/)[1]);
          return helmert(levels).map(([, cells]) => cells[j - 1]).join(', ');
        }
        const prompt = String(opts.prompt);
        const renamed = prompt.match(/Old Name: (\S+)\./);
        // Level and bin names must differ from each other: take them from the prompt.
        const levelName = /Level name|: Name$/.test(prompt) ? `L${prompt.replace(/[^A-Za-z0-9]/g, '').slice(-8)}` : undefined;
        // Model formulas typed in steps: the left-hand side, then the right-hand side ("— ~ (" when one-sided).
        const picks = PICKS(pass)[id] || {};
        const formula = /Left-hand side/.test(prompt) ? picks.lhs ?? 'n1' : / ~ \(/.test(prompt) ? picks.rhs ?? (/— ~ \(/.test(prompt) ? 'f2' : 'n2 + n3') : undefined;
        const counts = prompt.match(/Row (\d+) \((\d+)\)/);
        // A hypothesis matrix: row r tests coefficient r + 1 = 0; a table of counts: positive counts.
        const row = !counts ? undefined : /hypothesis/i.test(prompt)
          ? Array.from({ length: Number(counts[2]) }, (_, j) => String(Number(j === Number(counts[1])))).join(' ')
          : Array.from({ length: Number(counts[2]) }, (_, j) => String(4 + Number(counts[1]) * 3 + 7 * j)).join(' ');
        const picked = Object.keys(picks).find(k => prompt.includes(k));
        const value = (picked && typeof picks[picked] === 'string' ? picks[picked] : undefined) ?? formula ?? row ?? (prompt.includes('New name for') ? `${opts.value}_r` : renamed ? `${renamed[1]}_r` : levelName || (hit ? hit[1] : opts.value));
        const err = opts.validateInput?.(value);
        if (err) throw new Error(`Invalid default for "${opts.prompt}": ${value} (${err})`);
        return value;
      },
      showOpenDialog: async o => [{ fsPath: o.canSelectFolders ? tmp : fixtureFor(o.title, pass) }],
      showSaveDialog: async o => ({ fsPath: path.join(tmp, 'out_' + Math.random().toString(36).slice(2) + '.' + (Object.values(o.filters || { x: ['txt'] })[0][0])) }),
      showWarningMessage: async m => log.push(['warn', m]), showErrorMessage: async m => log.push(['error', m]),
      showInformationMessage: async m => log.push(['info', m]), visibleTextEditors: [], activeTextEditor: undefined
    }
  };
}


// Helmert contrasts as the cells of the coefficient matrix: [[level, [cells]], ...].
const helmert = levels => levels.map((level, i) => [level, levels.slice(1).map((_, j) => String(i <= j ? (i === j + 1 ? j + 1 : -1) : (i === j + 1 ? j + 1 : 0)))]);

// Stands in for the webview: fills every field the way a user clicking the first
// option would, then runs the same validation/normalization the form uses.
class FakeForm {
  constructor(pass, id) { this.pass = pass; this.picks = PICKS(pass)[id] || {}; this.t = text => text; }
  async run(spec, title, dialog, finish, env) {
    const fields = spec.fields;
    const raw = {};
    const pickLabel = f => Object.keys(this.picks).find(k => String(f.label || f.prompt).includes(k));
    for (const f of fields) {
      const values = model.normalize(fields, raw, env);
      if (f.when && !f.when(values)) continue;
      const list = model.items(f, values, env);
      const answer = ANSWERS.find(([k]) => String(f.label || f.prompt).includes(k));
      switch (f.type) {
        case 'var':
          if (this.picks[f.k] !== undefined) raw[f.k] = this.picks[f.k];
          else if (f.multi) raw[f.k] = list.slice(0, f.min === 0 ? (f.minOrNone ? 0 : (this.pass === 'B' || spec.check) ? 1 : 0) : Math.min(4, f.max ?? 4)).map(i => i.value);
          else if (f.optional) raw[f.k] = (this.pass === 'B' || spec.check) && list[0] ? list[0].value : '';
          else raw[f.k] = (list.find(i => i.value === this.picks[pickLabel(f)]) || list[0]).value;
          break;
        case 'dataset': case 'hclust': case 'model':
          raw[f.k] = (list.find(i => i.value === this.picks[pickLabel(f)]) || list.find(i => i.value === env.activeModel) || list[0]).value; break;
        case 'models': raw[f.k] = list.slice(0, 2).map(i => i.value); break;
        case 'installed': case 'rlist':
          if (f.of) {
            const lines = (await env.session.query(f.exprFor(raw[f.of], env.ctx))) || [];
            const names = lines.map(l => l.split('\t')[0]);
            raw[f.k] = f.single ? [names[f.k === 'level2' ? 1 : 0]] : (f.selectAll || this.pass === 'A' ? names : names.slice(-1));
          } else if (f.selectN) raw[f.k] = (this.pass === 'A' ? list.slice(0, f.selectN) : list.slice(-f.selectN)).map(i => i.value);
          else raw[f.k] = f.selectAll || f.single || f.selectFirst ? (f.selectAll ? list : list.slice(0, 1)).map(i => i.value) : this.pass === 'A' ? list.slice(0, 1).map(i => i.value) : list.slice(-1).map(i => i.value);
          break;
        case 'matrix': {
          const rows = await env.session.query(`levels(as.factor(${env.ctx.dv(values[f.of])}))`);
          raw[f.k] = helmert(rows);
          break;
        }
        case 'name': case 'text': raw[f.k] = this.picks[f.k] !== undefined ? this.picks[f.k] : answer ? answer[1] : ((this.pass === 'B' || (spec.check && !f.sampleOnlyB)) && f.optional && f.sample) ? f.sample : String(model.evalDefault(f.def, env.ctx, values) ?? ''); break;
        case 'num': case 'numlist': raw[f.k] = answer && f.type === 'numlist' ? answer[1] : String(f.def ?? ''); break;
        case 'choice': {
          const def = f.defFor ? f.defFor(values) : f.def;
          raw[f.k] = this.picks[f.k] ?? (this.pass === 'B' ? list[list.length - 1].value : (typeof def === 'string' ? list.find(i => i.value === def) : list[def || 0]).value);
          break;
        }
        case 'formula': raw[f.k] = { lhs: f.hasLhs === false ? '' : this.picks.lhs ?? 'n1', rhs: this.picks.rhs ?? (f.hasLhs === false ? 'f2' : 'n2 + n3') }; break;
        case 'table': {
          const fixed = f.colsExpr ? await env.session.query(f.colsExpr(env.ctx)) : null;
          const [nr, nc] = [Number(values[f.rowsOf]) || 2, fixed ? fixed.length : Number(values[f.colsOf]) || 2];
          raw[f.k] = { rows: Array.from({ length: nr }, (_, i) => `r${i + 1}`), cols: Array.from({ length: nc }, (_, j) => `c${j + 1}`),
            cells: Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => (fixed ? String(Number(i === j - 1)) : String(5 + 3 * i + 7 * j)))), rhs: Array.from({ length: nr }, () => '0') };
          break;
        }
        case 'flags': raw[f.k] = this.picks[f.k] || Object.fromEntries(f.items.map(([key, , on]) => [key, Boolean(on)])); break;
        case 'note': break;
        case 'hidden': raw[f.k] = String(model.evalDefault(f.def, env.ctx, values) ?? ''); break;
        case 'levelorder': {
          const rows = await env.session.query(`levels(as.factor(${env.ctx.dv(values[f.of])}))`);
          raw[f.k] = Object.fromEntries(rows.map((r, i) => [r, String(rows.length - i)])); // reversed order
          break;
        }
        case 'renames': raw[f.k] = Object.fromEntries(list.map((i, n) => [i.value, n < 2 ? `${i.value}_r` : i.value])); break;
        case 'dir': raw[f.k] = tmp; break;
        case 'file': raw[f.k] = f.mode === 'save' ? path.join(tmp, 'out_' + Math.random().toString(36).slice(2) + '.' + Object.values(f.filters || { x: ['txt'] })[0][0])
          : fixtureFor(this.t(f.label), this.pass); break;
        default: throw new Error(`no fill rule for ${f.type}`);
      }
    }
    const errors = model.validate(fields, raw, env);
    if (Object.keys(errors).length) throw new Error(`form validation failed: ${JSON.stringify(errors)}`);
    const problem = spec.check?.(model.normalize(fields, raw));
    if (problem) throw new Error(`form check failed: ${problem}`);
    const layout = model.layout(fields, raw, env);
    assert.equal(layout.length, fields.length);
    const values = model.normalize(fields, raw, env);
    if (spec.after && await spec.after(values, dialog, env.ctx) === false) return undefined;
    return values;
  }
}

(async () => {
  const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : undefined;
  const known = require('../data/commands.json');
  const ids = Object.keys(known).filter(id => !known[id].target && (!only || only.has(id))); // aliases run the same command
  const failures = [];
  const scripts = [];
  for (const mode of ['steps', 'form']) for (const pass of ['A', 'B']) {
    for (const id of ids) {
      const spec = catalog[id];
      if (spec.run) continue; // acts on a real editor (R Markdown / knitr documents): see tests/report.js
      const log = [];
      const session = new TestSession();
      const commander = new Commander({
        vscode: fakeVscode(pass, id, log), session, resource: () => undefined,
        settings: () => ({ limitOutput: false, maxOutputItems: 24, menuAction: 'run', dialogStyle: mode, loadRcmdrFunctions: false, cranMirror, packageDownloads: path.join(tmp, 'package-cache') }), notify: (m, l) => log.push([l, m]),
        updateSetting: async (key, value) => log.push(['setting', key, value]),
        form: mode === 'form' ? new FakeForm(pass, id) : undefined
      });
      commander.activeModel = 'RegModel.1';
      try {
        await commander.execute(id);
      } catch (error) {
        failures.push(`${mode}/${pass} ${id}: dialog threw ${error.message}`);
        continue;
      }
      // a command that needs something drawn first (Identify3D) says so instead of producing code
      const problems = log.filter(l => (l[0] === 'warn' || l[0] === 'error') && !(spec.emptyMessage && String(l[1]).includes(spec.emptyMessage)));
      if (problems.length) failures.push(`${mode}/${pass} ${id}: ${JSON.stringify(problems)}`);
      for (const r of session.records) scripts.push({ id: `${mode[0]}${pass}:${id}`, ...r });
      if (!session.records.length && !spec.vscode && !spec.url && !spec.run && !spec.emptyMessage && !spec.select && !spec.refresh && !problems.length) failures.push(`${mode}/${pass} ${id}: produced no code`);
    }
  }
  fs.writeFileSync(path.join(tmp, 'cases.json'), JSON.stringify(scripts));
  console.log(`generated ${scripts.length} snippets; dialog problems: ${failures.length}`);
  failures.forEach(f => console.log('  ' + f));
  // DIALOG_ONLY=1 checks the dialogs without running the code in R.
  if (process.env.DIALOG_ONLY) { process.exitCode = failures.length ? 1 : 0; return; }

  // Execute in R. Commands that would quit, open viewers or install are only parsed.
  const parseOnly = ['listInstalledPackages', 'CFA', 'importMinitab', 'closeCommanderAndR', 'viewData', 'viewDataSet', 'editDataSet', 'startHelp', 'browseRcmdrHexSticker', 'helpCommander', 'loadPackages', 'loadPlugins', 'helpDataSet'];
  const rscript = `
options(warn = 1); pdf(NULL)
local({
setup_runner <- new.env(); sys.source(${JSON.stringify(runnerR)}, setup_runner); suppressMessages(setup_runner$attach_rcmdr())
cases <- jsonlite::fromJSON(${JSON.stringify(path.join(tmp, 'cases.json'))}, simplifyVector = FALSE)
parse_only <- c(${parseOnly.map(p => JSON.stringify(p)).join(', ')})
for (case in cases) {
  rm(list = ls(envir = globalenv(), all.names = TRUE), envir = globalenv())
  source(${JSON.stringify(setupR)})
  runner <- new.env(); sys.source(${JSON.stringify(runnerR)}, runner)
  # the runner's helpers (save_output...) live on the search path as "R Play" in the real extension
  if ("R Play" %in% search()) detach("R Play", character.only = TRUE)
  attach(runner, name = "R Play")
  id <- sub("^..:", "", case$id)
  res <- tryCatch({
    # mouse identification waits for clicks on a window: only check that the code parses
    if (id %in% parse_only || grepl("method *= *.identify.", case$code)) { parse(text = case$code); "OK" } else {
      invisible(capture.output(runner$run_code(case$code, skip_help = FALSE, limit_output = FALSE, require = unlist(case$pkgs), quiet = TRUE)))
      "OK" }
  }, error = function(e) paste("FAIL:", conditionMessage(e)))
  cat(sprintf("%-4s %-34s %s\\n", substr(case$id, 1, 2), id, res))
  if (res != "OK") cat("      code:", gsub("\\n", " ⏎ ", substr(case$code, 1, 300)), "\\n")
}
})`;
  const out = spawnSync('Rscript', ['-e', rscript], { encoding: 'utf8', cwd: tmp, timeout: 900000 });
  fs.writeFileSync(path.join(tmp, 'r-output.txt'), out.stdout + '\n--- stderr ---\n' + out.stderr);
  const lines = out.stdout.split('\n');
  const bad = lines.filter(l => /FAIL/.test(l));
  console.log(`R run: ${lines.filter(l => / OK$/.test(l)).length} ok, ${bad.length} failed (full log: ${path.join(tmp, 'r-output.txt')})`);
  lines.forEach((l, i) => { if (/FAIL/.test(l)) console.log(l + '\n' + (lines[i + 1] || '')); });
  process.exitCode = failures.length || bad.length ? 1 : 0;
})();

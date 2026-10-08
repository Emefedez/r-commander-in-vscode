// Drives every command through the real Commander/Dialog code with a scripted
// fake VS Code, then runs the generated R in a real R session.
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
  if (/file to load/i.test(title)) return pick('two-frames.RData', 'small.csv');
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
  ['Probabilities', '0.25, 0.5'], ['From (>)', '-1'], ['To (<=)', '1'],
  ['Expression to compute', 'n1 + n2'], ['Random effects', '(1 | f3)'], ['Expression using these coefficient names', 'n2 / n3'], ['Expression in the coefficient names', 'n2 / n3'],
  ['Hypotheses separated', 'n2 = 0'], ['Names for the 3 bins', 'low, mid, high'], ['Subset expression', 'n1 > 1'],
  ['Right-hand side of the variance formula', 'n2'], ['Package names', 'car'], ['Name of the new variable', 'newvar'],
  ['Values of', '1, 2, 3'], ['URL of the data file', `file://${path.join(fixtures, 'small.csv')}`], ['Name of the data set in the R session', 'Dataset'],
  ['Name of the model in the R session', 'RegModel.1'], ['Package name', 'datasets'], ['Data set name', 'iris'],
  ['Rows to remove', '1, 2'], ['Rows to select', '1:10'], ['Variable names separated', 'u, w']
];
// single-pick overrides: command id -> { prompt substring: label }
const PICKS = (pass) => ({
  generalizedLinearModel: { 'Response variable': pass === 'A' ? 'f2b' : 'n3' },
  generalizedLinearMixedModel: { 'Response variable': pass === 'A' ? 'f2b' : 'n3' },
  multinomialLogitModel: { 'Response variable': 'f3' }, ordinalRegressionModel: { 'Response variable': 'f3' },
  mergeDataSets: { 'First data set': 'Dataset', 'Second data set': pass === 'A' ? 'Other' : 'Dataset' },
  compareModels: { 'First model': 'RegModel.1', 'Second model': 'RegModel.1' },
  readDataFromPackage: { 'Attached package': 'datasets', 'Data set': 'iris' }
});

function fakeVscode(pass, id, log) {
  const picks = PICKS(pass)[id] || {};
  const choose = (items, placeholder) => {
    // The CRAN mirror is always the first line: the test repository, never a real mirror.
    if (/CRAN mirror/.test(String(placeholder))) return items[0];
    const key = Object.keys(picks).find(k => String(placeholder).includes(k));
    if (key) return items.find(i => i.label === picks[key]) || items[0];
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
          if (items[0]?.key !== undefined) return items.filter(i => i.picked);
          if (/loading on factor [2-9]/.test(opts.placeHolder)) return []; // later CFA factors are left undefined
          const k = Math.min(items.length, id === 'twoWayRepeatedMeasures' || id === 'multiWayTable' ? 4 : 4);
          return items.slice(0, k).map(i => ({ ...i }));
        }
        return choose(items, opts.placeHolder);
      },
      showInputBox: async opts => {
        const hit = ANSWERS.find(([k]) => String(opts.prompt).includes(k));
        if (String(opts.prompt).includes('one number per level')) {
          const levels = String(opts.prompt).match(/\(([^)]*)\)\s*$/)[1].split(', ');
          const j = Number(String(opts.prompt).match(/Contrast (\d+)/)[1]);
          return helmert(levels).map(([, cells]) => cells[j - 1]).join(', ');
        }
        const value = String(opts.prompt).includes('New name for') ? `${opts.value}_r` : hit ? hit[1] : opts.value;
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
    const pickLabel = f => Object.keys(this.picks).find(k => String(f.label).includes(k));
    for (const f of fields) {
      const values = model.normalize(fields, raw, env);
      if (f.when && !f.when(values)) continue;
      const list = model.items(f, values, env);
      const answer = ANSWERS.find(([k]) => String(f.label).includes(k));
      switch (f.type) {
        case 'var':
          if (f.multi) raw[f.k] = list.slice(0, f.min === 0 ? (f.minOrNone ? 0 : this.pass === 'B' ? 1 : 0) : 4).map(i => i.value);
          else if (f.optional) raw[f.k] = this.pass === 'B' && list[0] ? list[0].value : '';
          else raw[f.k] = (list.find(i => i.value === this.picks[pickLabel(f)]) || list[0]).value;
          break;
        case 'dataset': case 'hclust': case 'model':
          raw[f.k] = (list.find(i => i.value === this.picks[pickLabel(f)]) || list.find(i => i.value === env.activeModel) || list[0]).value; break;
        case 'models': raw[f.k] = list.slice(0, 2).map(i => i.value); break;
        case 'installed': case 'rlist':
          if (f.of) {
            const lines = (await env.session.query(f.exprFor(raw[f.of], env.ctx))) || [];
            raw[f.k] = (f.selectAll || this.pass === 'A' ? lines : lines.slice(-1)).map(l => l.split('\t')[0]);
          } else raw[f.k] = f.selectAll || f.single || f.selectFirst ? (f.selectAll ? list : list.slice(0, 1)).map(i => i.value) : this.pass === 'A' ? list.slice(0, 1).map(i => i.value) : list.slice(-1).map(i => i.value);
          break;
        case 'matrix': {
          const rows = await env.session.query(`levels(as.factor(${env.ctx.dv(values[f.of])}))`);
          raw[f.k] = helmert(rows);
          break;
        }
        case 'name': case 'text': raw[f.k] = answer ? answer[1] : ((this.pass === 'B' || spec.check) && f.optional && f.sample) ? f.sample : String(model.evalDefault(f.def, env.ctx, values) ?? ''); break;
        case 'num': case 'numlist': raw[f.k] = answer && f.type === 'numlist' ? answer[1] : String(f.def ?? ''); break;
        case 'choice': raw[f.k] = this.pass === 'B' ? list[list.length - 1].value : list[f.def || 0].value; break;
        case 'flags': raw[f.k] = Object.fromEntries(f.items.map(([key, , on]) => [key, Boolean(on)])); break;
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
      const problems = log.filter(l => l[0] === 'warn' || l[0] === 'error');
      if (problems.length) failures.push(`${mode}/${pass} ${id}: ${JSON.stringify(problems)}`);
      for (const r of session.records) scripts.push({ id: `${mode[0]}${pass}:${id}`, ...r });
      if (!session.records.length && !spec.vscode && !spec.url && !spec.select && !spec.refresh && !problems.length) failures.push(`${mode}/${pass} ${id}: produced no code`);
    }
  }
  fs.writeFileSync(path.join(tmp, 'cases.json'), JSON.stringify(scripts));
  console.log(`generated ${scripts.length} snippets; dialog problems: ${failures.length}`);
  failures.forEach(f => console.log('  ' + f));

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
  id <- sub("^..:", "", case$id)
  res <- tryCatch({
    if (id %in% parse_only) { parse(text = case$code); "OK" } else {
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

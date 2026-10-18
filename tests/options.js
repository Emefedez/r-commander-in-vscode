// Option combinations the generic sweep does not reach, run in real R.
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const catalog = require('../catalog');
const { context } = require('../lib/rhelpers');
const model = require('../lib/formmodel');
const { t } = require('../lib/i18n');

const ctx = context('Dataset', { objects: [] });
ctx.model = 'RegModel.1';
const run = (id, values) => ({ id, code: catalog[id].code(values, ctx) });

const levels = ['x', 'y', 'z'];
const helmert = [['x', ['-1', '-1']], ['y', ['1', '-1']], ['z', ['0', '2']]];
const contrasts = model.normalize(catalog.setContrasts.fields, { f: 'f3', type: 'specify', matrix: helmert });
assert.deepEqual(model.validate(catalog.setContrasts.fields, { f: 'f3', type: 'specify', matrix: helmert }, { t }), {});
const dependent = [['x', ['1', '1']], ['y', ['2', '2']], ['z', ['3', '3']]]; // columns repeat: not independent
assert.ok(model.validate(catalog.setContrasts.fields, { f: 'f3', type: 'specify', matrix: dependent }, { t }).matrix, 'dependent contrasts are rejected');

// Confirmatory factor analysis needs data that really has factors (see run below with CFA_data).
const cfaValues = (extra = {}) => ({ name1: 'Visual', vars1: ['x1', 'x2', 'x3'], name2: 'Verbal', vars2: ['x4', 'x5', 'x6'], matrix: 'covariance', cor: 'correlated',
  identify: 'factors', robust: { robust: false }, indices: { AIC: true, BIC: true, GFI: true, RMSEA: true, CFI: true }, ...extra });
const cfaCtx = context('CFA_data', { objects: [] });
const cfaRun = values => ({ id: 'CFA', code: catalog.CFA.code(values, cfaCtx) });
const cases = [
  cfaRun(cfaValues()),
  cfaRun(cfaValues({ matrix: 'correlation', cor: 'orthogonal', identify: 'loadings', robust: { robust: true }, indices: { AIC: true } })),
  cfaRun({ ...cfaValues(), name2: undefined, vars2: [], indices: { AIC: true } }),
  run('setContrasts', contrasts),
  run('effectPlots', { cls: 'lm', all: 'FALSE', partial: { partial: true }, predictors: ['n2'], style: 'stacked', span: '50' }),
  run('effectPlots', { cls: 'lm', all: 'FALSE', partial: { partial: false }, predictors: ['n2', 'n3'], style: 'stacked', span: '50' }),
  run('predictorEffectPlots', { cls: 'lm', all: 'FALSE', partial: { partial: true }, predictors: ['n3'], style: 'stacked', span: '40' }),
  run('predictorEffectPlots', { cls: 'lm', all: 'TRUE', partial: { partial: false }, predictors: [], style: 'stacked', span: '50' }),
  run('stemAndLeaf', { x: 'n1', g: 'f2', levels: ['a', 'b'], auto: { auto: false }, unit: '-1', m: '2', style: 'Tukey', opts: { trim: false, depths: false, reverse: false } }),
  run('stemAndLeaf', { x: 'n4', g: undefined, auto: { auto: true }, unit: '0', m: '1', style: 'bare', opts: { trim: true, depths: true, reverse: true } })
];
const script = `
pdf(NULL)
local({ r <- new.env(); sys.source(${JSON.stringify(path.join(__dirname, '..', 'runner.R'))}, r); suppressMessages(r$attach_rcmdr()) })
cases <- list(${cases.map(c => JSON.stringify(c.code)).join(', ')})
ids <- c(${cases.map(c => JSON.stringify(c.id)).join(', ')})
for (i in seq_along(cases)) {
  rm(list = setdiff(ls(globalenv()), c("cases", "ids", "i")), envir = globalenv())
  source(${JSON.stringify(path.join(__dirname, 'setup.R'))})
  set.seed(7); f1 <- rnorm(300); f2 <- 0.4 * f1 + rnorm(300)
  CFA_data <- data.frame(x1 = f1 + rnorm(300, 0, .6), x2 = 0.8 * f1 + rnorm(300, 0, .6), x3 = 0.7 * f1 + rnorm(300, 0, .6),
                         x4 = f2 + rnorm(300, 0, .6), x5 = 0.8 * f2 + rnorm(300, 0, .6), x6 = 0.7 * f2 + rnorm(300, 0, .6))
  res <- tryCatch({ invisible(capture.output(source(exprs = parse(text = cases[[i]]), local = globalenv()))); "OK" }, error = function(e) paste("FAIL:", conditionMessage(e)))
  cat(sprintf("%-22s %s\\n", ids[[i]], res))
  if (res != "OK") cat("   ", gsub("\\n", " | ", cases[[i]]), "\\n")
}`;
const out = spawnSync('Rscript', ['-e', script], { encoding: 'utf8' });
console.log(out.stdout);
assert.equal(out.status, 0, out.stderr);
assert.doesNotMatch(out.stdout, /FAIL/);
console.log('extra option combinations run in R.');

// Permanent downloads: a package downloaded once is reinstalled from the download folder, with no mirror.
// The repository is served over local HTTP, because R installs file:// repositories in place instead of downloading.
{
  const fs = require('node:fs');
  const os = require('node:os');
  const { spawn } = require('node:child_process');
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'rcp-keep-'));
  spawnSync('Rscript', [path.join(__dirname, 'make-repo.R'), base], { encoding: 'utf8' });
  const port = 20000 + Math.floor(Math.random() * 20000);
  const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', path.join(base, 'repo')], { stdio: 'ignore' });
  const mirror = `http://127.0.0.1:${port}`;
  try {
    for (let i = 0; i < 50 && spawnSync('curl', ['-sf', `${mirror}/src/contrib/PACKAGES`]).status !== 0; i++) spawnSync('sleep', ['0.1']);
    const env = { ...process.env, R_LIBS: path.join(base, 'lib') };
    const folder = path.join(base, 'downloads');
    const install = (url, keep) => catalog.installPackages.code({ mirror: [url], pkgs: ['rcptwo'], names: '', flags: { suggests: false, force: false, keep }, folder }, ctx);
    const run = code => spawnSync('Rscript', ['-e', `${code}\ncat("INSTALLED:", nzchar(system.file(package = "rcptwo")), "\\n")`], { encoding: 'utf8', env });
    const remove = () => spawnSync('Rscript', ['-e', `remove.packages("rcptwo", lib = ${JSON.stringify(path.join(base, 'lib'))})`], { encoding: 'utf8', env });

    const first = run(install(mirror, true));
    assert.match(first.stdout, /INSTALLED: TRUE/, first.stderr);
    assert.match(first.stderr, /trying URL 'http:\/\/127\.0\.0\.1/, 'the package was really downloaded');
    assert.ok(fs.existsSync(path.join(folder, 'src', 'contrib', 'rcptwo_1.0.tar.gz')), 'the download was kept');
    assert.ok(fs.existsSync(path.join(folder, 'src', 'contrib', 'PACKAGES')), 'and indexed');

    remove();
    const unreachable = 'http://127.0.0.1:9';
    const again = run(install(unreachable, true));
    assert.match(again.stdout, /INSTALLED: TRUE/, `reinstalled from the download folder\n${again.stderr}`);
    assert.doesNotMatch(again.stderr, /trying URL 'http/, 'nothing was downloaded the second time');

    remove();
    const temporary = run(install(unreachable, false));
    assert.match(temporary.stdout, /INSTALLED: FALSE/, 'without the permanent folder an unreachable mirror cannot supply it');
    console.log('downloads are kept and reused without a mirror.');
  } finally {
    server.kill();
    fs.rmSync(base, { recursive: true, force: true });
  }
}

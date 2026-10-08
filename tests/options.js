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
const contrasts = model.normalize(catalog.setContrasts.fields, { f: 'f3', type: 'custom', matrix: helmert });
assert.deepEqual(model.validate(catalog.setContrasts.fields, { f: 'f3', type: 'custom', matrix: helmert }, { t }), {});
const dependent = [['x', ['1', '1']], ['y', ['2', '2']], ['z', ['3', '3']]]; // columns repeat: not independent
assert.ok(model.validate(catalog.setContrasts.fields, { f: 'f3', type: 'custom', matrix: dependent }, { t }).matrix, 'dependent contrasts are rejected');

const cases = [
  run('setContrasts', contrasts),
  run('effectPlots', { flags: { all: false, resid: true }, terms: ['n2'], style: 'multiline', span: '0.5' }),
  run('effectPlots', { flags: { all: false, resid: false }, terms: ['n2', 'n3'], style: 'panels', span: '0.5' }),
  run('predictorEffectPlots', { flags: { all: false, resid: true }, terms: ['n3'], style: 'panels', span: '0.4' }),
  run('predictorEffectPlots', { flags: { all: true, resid: false }, terms: [], style: 'multiline', span: '0.5' }),
  run('stemAndLeaf', { x: 'n1', back: 'f2', leaf: '-1', parts: '2', style: 'Tukey', flags: { trim: false, depths: false, reverse: false } }),
  run('stemAndLeaf', { x: 'n4', back: undefined, leaf: 'auto', parts: '1', style: 'bare', flags: { trim: true, depths: true, reverse: true } })
];
const script = `
pdf(NULL)
cases <- list(${cases.map(c => JSON.stringify(c.code)).join(', ')})
ids <- c(${cases.map(c => JSON.stringify(c.id)).join(', ')})
for (i in seq_along(cases)) {
  rm(list = setdiff(ls(globalenv()), c("cases", "ids", "i")), envir = globalenv())
  source(${JSON.stringify(path.join(__dirname, 'setup.R'))})
  res <- tryCatch({ invisible(capture.output(source(exprs = parse(text = cases[[i]]), local = globalenv()))); "OK" }, error = function(e) paste("FAIL:", conditionMessage(e)))
  cat(sprintf("%-22s %s\\n", ids[[i]], res))
  if (res != "OK") cat("   ", gsub("\\n", " | ", cases[[i]]), "\\n")
}`;
const out = spawnSync('Rscript', ['-e', script], { encoding: 'utf8' });
console.log(out.stdout);
assert.equal(out.status, 0, out.stderr);
assert.doesNotMatch(out.stdout, /FAIL/);
console.log('extra option combinations run in R.');

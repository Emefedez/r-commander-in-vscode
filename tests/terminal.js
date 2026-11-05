// What the console shows: one short line to start a run, and the code echoed as it was written.
require('./headless');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { RSession } = require('../lib/rsession');

(async () => {
  const sent = [];
  const session = new RSession({ commands: { executeCommand: async (name, text) => sent.push(text) } }, path.join(__dirname, '..', 'runner.R'));
  const script = [
    '# Ejemplo 2.3', 'x<-1:10 # x<-c(1,2,3,4,5,6,7,8,9,10)', 'mean(x)', '', '?sample', 'w<-1/x # vector de peso',
    'f <- function(a,', '              b) {', '  a + b   # suma', '}', 'f(1,', '  2)', '', '# media geométrica', '#'
  ].join('\n');
  await session.run(script, { settings: { skipHelp: true, skipCommands: [], limitOutput: true, maxOutputItems: 24, loadRcmdrFunctions: false } });

  // The terminal gets a short line, whatever the size of the script.
  assert.equal(sent.length, 1);
  assert.match(sent[0], /^source\("[^"]+rcp-\d+-\d+\.R", encoding = "UTF-8"\)$/);
  assert.ok(sent[0].length < 80, `the command is ${sent[0].length} characters`);
  assert.ok(!sent[0].includes('Ejemplo'), 'the code is not in the command');

  const out = spawnSync('Rscript', ['--vanilla', '-e', sent[0]], { encoding: 'utf8' });
  assert.equal(out.status, 0, out.stderr);
  const echoed = out.stdout.split('\n');
  // Code as written: spacing, trailing comments, multi-line functions and the comment lines around.
  for (const line of ['> # Ejemplo 2.3', '> x<-1:10 # x<-c(1,2,3,4,5,6,7,8,9,10)', '> mean(x)', '> w<-1/x # vector de peso',
    '> f <- function(a,', '+               b) {', '+   a + b   # suma', '+ }', '> f(1,', '+   2)', '> # media geométrica']) {
    assert.ok(echoed.includes(line), `missing echo line: ${line}`);
  }
  assert.ok(!echoed.some(line => line.startsWith('> ?')), 'skipped help is not echoed');
  assert.ok(echoed.includes('[1] 5.5') && echoed.includes('[1] 3'), 'results are printed');
  assert.ok(!fs.existsSync(sent[0].match(/"([^"]+)"/)[1]), 'the job file removes itself');

  // The helpers live in the "R Play" search-path entry, not in the user's workspace.
  sent.length = 0;
  await session.run('print(ls(all.names = TRUE))\ncat("R Play" %in% search(), exists("run_code", envir = globalenv(), inherits = FALSE), "\\n")', { settings: { loadRcmdrFunctions: false } });
  const clean = spawnSync('Rscript', ['--vanilla', '-e', sent[0]], { encoding: 'utf8' });
  assert.match(clean.stdout, /character\(0\)/);
  assert.match(clean.stdout, /TRUE FALSE/);

  // Errors still read like the console and stop the run.
  sent.length = 0;
  await session.run('a <- 1\nstop("boom")\nb <- 2', { settings: { loadRcmdrFunctions: false } });
  const failed = spawnSync('Rscript', ['--vanilla', '-e', sent[0]], { encoding: 'utf8' });
  assert.match(failed.stderr, /Error: boom/);
  assert.ok(!failed.stdout.includes('> b <- 2'), 'nothing runs after the error');
  // Fixed notation prints small numbers in full (scipen only for the length of the run).
  const fixedSent = [];
  const fixedSession = new RSession({ commands: { executeCommand: async (name, text) => fixedSent.push(text) } }, path.join(__dirname, '..', 'runner.R'));
  const fixedCode = 'x <- 2.78900236799773e-05\nprint(x)';
  await fixedSession.run(fixedCode, { settings: { fixedNotation: true, loadRcmdrFunctions: false } });
  await fixedSession.run(fixedCode, { settings: { loadRcmdrFunctions: false } });
  const fixedOut = fixedSent.map(c => spawnSync('Rscript', ['--vanilla', '-e', c, '-e', 'cat("after:", getOption("scipen"), "\\n")'], { encoding: 'utf8' }).stdout);
  assert.match(fixedOut[0], /\[1\] 0\.00002789002/);
  assert.match(fixedOut[0], /after: 0/, 'scipen is restored after the run');
  assert.match(fixedOut[1], /2\.789002e-05/, 'off by default');

  // The run-target hook runs before every send (runs and queries), so terminal/arf routing is applied first.
  const order = [];
  const routed = new RSession({ commands: { executeCommand: async () => order.push('send') } }, path.join(__dirname, '..', 'runner.R'), async () => order.push('route'));
  await routed.run('1+1', { settings: { loadRcmdrFunctions: false } });
  routed.query('1', 50).catch(() => {});
  await new Promise(r => setTimeout(r, 20));
  assert.deepEqual(order, ['route', 'send', 'route', 'send']);
  console.log('the terminal shows one short line and the code as written.');
})();

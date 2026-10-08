// A run with the default settings makes R Commander's and its plug-ins' functions
// available (calcular_frecuencia, Recode...) without starting the Tk window.
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { RSession } = require('../lib/rsession');

(async () => {
  const sent = [];
  const vscode = { commands: { executeCommand: async (name, command) => sent.push(command) } };
  const session = new RSession(vscode, path.join(__dirname, '..', 'runner.R'));
  const code = [
    'calcular_frecuencia(df.nominal = iris["Species"], ordenado.frec = FALSE, df.ordinal = NULL, cuantil.p = 0.5, iprint = TRUE)',
    'x <- Recode(iris$Sepal.Length, "lo:5.5 = 1; else = 2")',
    'table(x)',
    'cat("GUI:", exists("commanderWindow"), "\\n")'
  ].join('\n');
  await session.run(code, { settings: { limitOutput: false, loadRcmdrFunctions: true, rcmdrPlugins: [] } });
  const result = spawnSync('Rscript', ['--vanilla', '-e', sent[0]], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Nominal variables:/);
  assert.match(result.stdout, /setosa\s+50/);
  assert.match(result.stdout, /GUI: FALSE/);
  assert.doesNotMatch(result.stderr, /could not find function/);

  await session.run('exists("calcular_frecuencia")', { settings: { loadRcmdrFunctions: false } });
  assert.doesNotMatch(require('node:fs').readFileSync(sent[1].match(/"([^"]+)"/)[1], 'utf8'), /attach_rcmdr/);
  // The green play button runs a whole script: every graph in it must still be drawn.
  const fs = require('node:fs');
  const os = require('node:os');
  const pdf = path.join(os.tmpdir(), `rcp-plots-${process.pid}.pdf`);
  const script = [
    'plot(1:10, main = "line")', 'hist(rnorm(100))', 'boxplot(iris$Sepal.Length ~ iris$Species)', 'barplot(table(iris$Species))',
    'pie(table(iris$Species))', 'RcmdrMisc::Hist(iris$Sepal.Length, scale = "frequency")', 'car::scatterplot(Sepal.Length ~ Petal.Length, data = iris)',
    'cat("DEVICES:", length(dev.list()), "\\n")'
  ].join('\n');
  for (const loadRcmdrFunctions of [true, false]) {
    sent.length = 0;
    await session.run(script, { settings: { limitOutput: true, maxOutputItems: 24, loadRcmdrFunctions, rcmdrPlugins: [] } });
    fs.rmSync(pdf, { force: true });
    const drawn = spawnSync('Rscript', ['--vanilla', '-e', `options(device = function(...) pdf(file = ${JSON.stringify(pdf)}, onefile = TRUE)); ${sent[0]}; invisible(graphics.off())`], { encoding: 'utf8' });
    assert.equal(drawn.status, 0, drawn.stderr);
    assert.match(drawn.stdout, /DEVICES: 1/);
    const pages = (fs.readFileSync(pdf, 'latin1').match(/\/Type \/Page\b/g) || []).length;
    assert.ok(pages >= 7, `expected at least 7 plots with loadRcmdrFunctions=${loadRcmdrFunctions}, got ${pages}`);
  }
  fs.rmSync(pdf, { force: true });
  console.log('R Commander functions are available without the GUI, and the green play still draws every graph.');
})();

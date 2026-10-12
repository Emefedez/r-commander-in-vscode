// Hovering a call to an R function names the R Commander menu entries that use it.
const assert = require('node:assert/strict');
const { MenuHover, menuPaths } = require('../lib/hover');
const { setLanguage } = require('../lib/i18n');

class MarkdownString { constructor() { this.value = ''; } appendMarkdown(text) { this.value += text; } }
class Hover { constructor(contents, range) { this.contents = contents; this.range = range; } }
const vscode = { Hover, MarkdownString };

function documentWith(line) {
  return {
    getWordRangeAtPosition: (position, pattern) => {
      for (const m of line.matchAll(new RegExp(pattern.source, 'g'))) {
        if (m.index <= position && position <= m.index + m[0].length) return { start: { line: 0, character: m.index }, end: { line: 0, character: m.index + m[0].length } };
      }
      return undefined;
    },
    getText: range => line.slice(range.start.character, range.end.character),
    lineAt: () => ({ text: line })
  };
}
const hover = (line, at) => new MenuHover(vscode).provideHover(documentWith(line), line.indexOf(at) + 1);

setLanguage('es');
let h = hover('t.test(x, mu = 0)', 't.test');
assert.ok(h, 'hover for t.test');
assert.match(h.contents.value, /Estadística ▸ Medias ▸ Prueba t para una muestra/);
assert.match(h.contents.value, /command:rcp\.cmd\.singleSampleTTest/);
assert.ok(h.contents.isTrusted.enabledCommands.every(c => c.startsWith('rcp.cmd.')), 'only our own commands are trusted');

h = hover('Hist(iris$Sepal.Length)', 'Hist');
assert.match(h.contents.value, /Gráficos ▸ Histograma/);
h = hover('RcmdrMisc::Hist(x)', 'Hist');
assert.match(h.contents.value, /Gráficos ▸ Histograma/, 'namespaced calls work');
h = hover('hist(x)', 'hist');
assert.match(h.contents.value, /Histograma/, 'plain hist() points to the Histogram dialog');
h = hover('pie(table(x))', 'pie');
assert.match(h.contents.value, /Gráficos ▸ Gráfica de sectores/);

assert.equal(hover('summary <- 3', 'summary'), undefined, 'a variable called like a function gets no hover');
assert.equal(hover('mi_funcion(x)', 'mi_funcion'), undefined, 'unknown functions get no hover');
h = hover('summary(m)', 'summary');
assert.match(h.contents.value, /y \d+ más/, 'long lists are cut');

setLanguage('en');
h = hover('t.test(x)', 't.test');
assert.match(h.contents.value, /Statistics ▸ Means ▸ Single-sample t-test/);
setLanguage('es');

const paths = menuPaths();
assert.ok(Object.keys(paths).length >= 240);
console.log('hover shows where each function is in the menus.');

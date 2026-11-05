// R Markdown / knitr documents that collect the commands, and the menu commands that drive them.
const assert = require('node:assert/strict');
const report = require('../lib/report');
const { Commander } = require('../lib/commander');

// --- pure text handling -------------------------------------------------------------------------
let rmd = report.template('rmd');
rmd = report.append('rmd', rmd, 'Summary', 'summary(x)');
rmd = report.append('rmd', rmd, '3D plot', 'library(rgl)\nscatter3d(y ~ x1 + x2, data = d)');
rmd = report.append('rmd', rmd, 'Identify', "scatterplot(y ~ x, id=list(method='identify'))");
assert.match(rmd, /### Summary\n\n```\{r\}\nsummary\(x\)\n```/);
assert.match(rmd, /```\{r, webgl=TRUE\}\nlibrary\(rgl\)/, 'rgl commands get webgl');
assert.ok(!rmd.includes('Identify'), 'mouse commands cannot be knitted, so they stay out');

const withoutLast = report.removeLastBlock('rmd', rmd);
assert.ok(!withoutLast.includes('3D plot') && !withoutLast.includes('scatter3d'), 'the last block goes with its title');
assert.match(withoutLast, /### Summary/);
assert.match(withoutLast, /echo=FALSE/, 'the setup block is untouched when it is not the last');

const onlyTitle = report.removeLastTitle('rmd', rmd);
assert.ok(!onlyTitle.includes('### 3D plot'));
assert.match(onlyTitle, /scatter3d/, 'the code stays when only the title is removed');
assert.match(onlyTitle, /# include this code chunk as-is/, 'comments inside code blocks are not titles');

let rnw = report.template('rnw');
rnw = report.append('rnw', rnw, 'Summary', 'summary(x)');
rnw = report.append('rnw', rnw, 'Means', 'mean(x)');
assert.match(rnw, /\\subsection\*\{Means\}\n\n<<>>=\nmean\(x\)\n@/);
assert.ok(rnw.trim().endsWith('\\end{document}'), 'blocks go before \\end{document}');
const rnwLess = report.removeLastBlock('rnw', rnw);
assert.ok(!rnwLess.includes('Means') && rnwLess.includes('Summary') && rnwLess.includes('\\end{document}'));
assert.equal(report.removeLastBlock('rmd', 'nothing here'), 'nothing here');

// --- the Commander commands ---------------------------------------------------------------------
const docs = new Map();
const makeDoc = (uri, text) => {
  const doc = { uri, languageId: 'rmd', _text: text, getText() { return this._text; }, positionAt: n => n, lineCount: 1 };
  docs.set(uri.toString(), doc);
  return doc;
};
const written = new Map();
const vscode = {
  ViewColumn: { Beside: -2 },
  Uri: { file: fsPath => ({ scheme: 'file', fsPath, toString: () => `file://${fsPath}` }) },
  Range: class { constructor(a, b) { this.a = a; this.b = b; } },
  WorkspaceEdit: class { replace(uri, range, text) { this.uri = uri; this.text = text; } },
  workspace: {
    get textDocuments() { return [...docs.values()]; },
    fs: { stat: async uri => { if (!written.has(uri.toString())) throw Error('missing'); }, writeFile: async (uri, data) => written.set(uri.toString(), Buffer.from(data).toString('utf8')) },
    openTextDocument: async arg => makeDoc(arg, written.get(arg.toString())),
    applyEdit: async edit => { docs.get(edit.uri.toString())._text = edit.text; return true; }
  },
  window: { showTextDocument: async () => {}, showWarningMessage: async () => {} }
};
const notices = [];
const script = vscode.Uri.file('/tmp/work/analysis.R');
const commander = new Commander({ vscode, session: { run: async () => {} }, settings: () => ({ menuAction: 'run' }), resource: () => script, notify: (m, l) => notices.push([l, m]) });

(async () => {
  await commander.removeFromDocument('rmd', 'block');
  assert.equal(notices.at(-1)[0], 'warn', 'removing before starting a document warns');

  await commander.startDocument('rmd');
  assert.ok(written.has('file:///tmp/work/analysis.Rmd'), 'the document is created next to the script');
  await commander.deliver('summary(x)', {}, 'Numerical summaries');
  await commander.deliver('mean(x)', {}, 'Means');
  const text = docs.get('file:///tmp/work/analysis.Rmd').getText();
  assert.match(text, /### Numerical summaries[\s\S]*### Means/);

  await commander.removeFromDocument('rmd', 'block');
  assert.ok(!docs.get('file:///tmp/work/analysis.Rmd').getText().includes('### Means'));

  await commander.startDocument('rnw');
  await commander.deliver('sd(x)', {}, 'Spread');
  assert.match(docs.get('file:///tmp/work/analysis.Rnw').getText(), /<<>>=\nsd\(x\)\n@/);
  assert.match(docs.get('file:///tmp/work/analysis.Rmd').getText(), /### Spread/, 'both documents keep collecting');
  console.log('R Markdown and knitr documents collect, and remove, the commands.');
})();

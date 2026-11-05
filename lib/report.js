// R Markdown and knitr documents that grow as menu commands run (Rcmdr's "Edit R Markdown document" /
// "Edit knitr document"): the starting template, one block per command, and removing the last block or title.
const KINDS = {
  rmd: { ext: 'Rmd', language: 'rmd' },
  rnw: { ext: 'Rnw', language: 'latex' }
};

const RMD_HEADER = [
  '---', 'title: "Replace with Main Title"', 'author: "Your Name"', 'date: "AUTOMATIC"', '---', '',
  '```{r echo=FALSE}', '# include this code chunk as-is to set options',
  'knitr::opts_chunk$set(comment=NA, prompt=TRUE, out.width=750, fig.height=8, fig.width=8)',
  'library(Rcmdr)', 'library(car)', 'library(RcmdrMisc)', '```', '', ''].join('\n');
const RNW_HEADER = [
  '\\documentclass[11pt]{article}', '\\usepackage[margin=1in]{geometry}', '\\begin{document}', '',
  '\\title{Replace with Main Title}', '\\author{Your Name}', '\\maketitle', '',
  '<<echo=FALSE>>=', '# include this code chunk as-is to set options',
  'knitr::opts_chunk$set(comment=NA, prompt=TRUE, fig.height=5, fig.width=5)',
  'library(Rcmdr)', 'library(car)', 'library(RcmdrMisc)', '@', '', ''].join('\n');
const RNW_FOOTER = '\\end{document}\n';

const template = kind => (kind === 'rnw' ? RNW_HEADER + RNW_FOOTER : RMD_HEADER);

// Commands that need the mouse on an rgl window cannot be knitted, so they stay out of the document (as in Rcmdr).
const interactive = code => /method\s*=\s*['"]identify['"]/.test(code);

// The text added for one command: a section title and its code block.
function block(kind, title, code) {
  if (interactive(code)) return '';
  const webgl = /\blibrary\(rgl\)|\b(scatter3d|crPlot3d|avPlot3d)\(/.test(code);
  if (kind === 'rnw') return `\\subsection*{${title}}\n\n<<${webgl ? 'webgl=TRUE' : ''}>>=\n${code}\n@\n\n`;
  return `### ${title}\n\n\`\`\`{r${webgl ? ', webgl=TRUE' : ''}}\n${code}\n\`\`\`\n\n`;
}

// Adds a block at the end of the document text (before \end{document} in knitr documents).
function append(kind, text, title, code) {
  const added = block(kind, title, code);
  if (!added) return text;
  if (kind === 'rnw') {
    const end = text.lastIndexOf('\\end{document}');
    if (end >= 0) return text.slice(0, end).replace(/\n*$/, '\n\n') + added + text.slice(end);
  }
  return text.replace(/\n*$/, '\n\n') + added;
}

// The start of the last code block (and the index just after it), or undefined.
function lastBlock(kind, text) {
  const open = kind === 'rnw' ? /^<<[^\n]*>>=[ \t]*$/gm : /^```\{r[^\n]*\}[ \t]*$/gm;
  const close = kind === 'rnw' ? /^@[ \t]*$/m : /^```[ \t]*$/m;
  let start;
  for (let m; (m = open.exec(text));) start = m.index;
  if (start === undefined) return undefined;
  const rest = text.slice(start).replace(/^[^\n]*\n/, '');
  const m = close.exec(rest);
  const lineEnd = text.slice(start).indexOf('\n') + 1;
  return { start, end: m ? start + lineEnd + m.index + m[0].length : text.length };
}

// Removes the last command block, and the section title just before it when nothing else is between them.
function removeLastBlock(kind, text) {
  const found = lastBlock(kind, text);
  if (!found) return text;
  let start = found.start;
  // The section title written just before the block goes with it.
  const before = text.slice(0, start).replace(/\s+$/, '');
  const lineStart = before.lastIndexOf('\n') + 1;
  if ((kind === 'rnw' ? /^\\subsection\*\{/ : /^###/).test(before.slice(lineStart))) start = lineStart;
  const after = text.slice(found.end).replace(/^\n+/, '');
  return (text.slice(0, start).replace(/\n*$/, '\n\n') + after).replace(/^\n+$/, '');
}

// Removes the last section title line.
function removeLastTitle(kind, text) {
  const re = kind === 'rnw' ? /^\\(?:sub)*section\*?\{[^\n]*\}[ \t]*\n?/gm : /^#{1,6} [^\n]*\n?/gm;
  let last;
  const code = kind === 'rnw' ? null : /^```[^\n]*\n[\s\S]*?^```[ \t]*$/gm;
  const spans = [];
  if (code) for (let m; (m = code.exec(text));) spans.push([m.index, m.index + m[0].length]);
  for (let m; (m = re.exec(text));) {
    if (!spans.some(([a, b]) => m.index >= a && m.index < b)) last = m; // a # comment inside a code block is not a title
  }
  if (!last) return text;
  return text.slice(0, last.index) + text.slice(last.index + last[0].length).replace(/^\n/, '');
}

module.exports = { KINDS, template, block, append, removeLastBlock, removeLastTitle, interactive };

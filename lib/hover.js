const tree = require('../data/tree.json');
const functions = require('../data/functions.json');
const { getLanguage, t } = require('./i18n');

const MAX_SHOWN = 6;

// Where each command sits in the menus (in the current language) and in what order.
function menuPaths() {
  const paths = {};
  let order = 0;
  const walk = (nodes, trail) => {
    for (const node of nodes) {
      if (node.sep) continue;
      const label = node.label[getLanguage()] || node.label.en;
      if (node.children) walk(node.children, [...trail, label]);
      else if (!((node.target || node.id) in paths)) paths[node.target || node.id] = { path: [...trail, label], order: order++, id: node.id };
    }
  };
  walk(tree, []);
  return paths;
}

// Hovering a call to an R function tells where to find it in the R Commander menus.
class MenuHover {
  constructor(vscode) { this.vscode = vscode; }

  provideHover(document, position) {
    const { Hover, MarkdownString } = this.vscode;
    const range = document.getWordRangeAtPosition(position, /[A-Za-z.][A-Za-z0-9._]*(::[A-Za-z.][A-Za-z0-9._]*)?/);
    if (!range) return undefined;
    const name = document.getText(range).split('::').pop();
    const ids = functions[name];
    if (!ids) return undefined;
    // Only calls: a variable that happens to be called like a function is left alone.
    const rest = document.lineAt(range.end.line).text.slice(range.end.character);
    if (!/^\s*\(/.test(rest)) return undefined;

    const paths = menuPaths();
    const entries = ids.filter(id => paths[id]).sort((a, b) => paths[a].order - paths[b].order);
    if (!entries.length) return undefined;
    const md = new MarkdownString(undefined, true);
    md.isTrusted = { enabledCommands: entries.map(id => `rcp.cmd.${paths[id].id}`) };
    md.supportThemeIcons = true;
    md.appendMarkdown(`**R Commander** · ${t('Menu')} — \`${name}()\`\n\n`);
    for (const id of entries.slice(0, MAX_SHOWN)) {
      md.appendMarkdown(`- $(play-circle) [${paths[id].path.join(' ▸ ')}](command:rcp.cmd.${id})\n`);
    }
    if (entries.length > MAX_SHOWN) md.appendMarkdown(`\n${t('and {0} more', entries.length - MAX_SHOWN)}\n`);
    return new Hover(md, range);
  }
}

module.exports = { MenuHover, menuPaths };

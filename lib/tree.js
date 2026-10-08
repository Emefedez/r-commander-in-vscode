const tree = require('../data/tree.json');
const { getLanguage } = require('./i18n');

// The R Commander menus as a tree in the R sidebar. Each top-level menu has its own
// icon and theme colour, inherited by what is inside it, and the separators of the
// Rcmdr menus show as a thin line between groups. Leaves run their command.
class MenuTree {
  constructor(vscode) {
    this.vscode = vscode;
    this.emitter = new vscode.EventEmitter();
    this.onDidChangeTreeData = this.emitter.event;
  }

  refresh() { this.emitter.fire(); }

  getChildren(node) { return node ? node.children || [] : tree; }

  getTreeItem(node) {
    const { TreeItem, TreeItemCollapsibleState, ThemeIcon, ThemeColor } = this.vscode;
    if (node.sep) {
      const line = new TreeItem('────────────', TreeItemCollapsibleState.None);
      line.contextValue = 'separator';
      line.accessibilityInformation = { label: '' };
      return line;
    }
    const label = node.label[getLanguage()] || node.label.en;
    const item = new TreeItem(label, node.children ? TreeItemCollapsibleState.Collapsed : TreeItemCollapsibleState.None);
    item.iconPath = new ThemeIcon(node.icon, node.color ? new ThemeColor(node.color) : undefined);
    if (!node.children) {
      item.command = { command: `rcp.cmd.${node.id}`, title: label };
      item.tooltip = label;
    }
    return item;
  }
}

module.exports = { MenuTree };

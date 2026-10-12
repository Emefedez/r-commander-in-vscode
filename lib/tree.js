const tree = require('../data/tree.json');
const { getLanguage } = require('./i18n');

// A stable path for every node ("2/0/5"), so the tree items can carry ids.
const keyNodes = (nodes, parent = '') => nodes.forEach((node, i) => {
  node.key = parent + i;
  if (node.children) keyNodes(node.children, `${node.key}/`);
});
keyNodes(tree);

// The R Commander menus as a tree in the R sidebar. Each top-level menu has its own
// icon and theme colour, inherited by what is inside it, and the separators of the
// Rcmdr menus show as a thin line between groups. Leaves run their command.
class MenuTree {
  constructor(vscode) {
    this.vscode = vscode;
    this.emitter = new vscode.EventEmitter();
    this.onDidChangeTreeData = this.emitter.event;
    this.query = '';
    this.generation = 0;
  }

  refresh() { this.emitter.fire(); }

  // VS Code keeps the expanded state of a tree item by its id, so new ids show every
  // menu with its default state: collapsed, or expanded for search results.
  collapseAll() { this.generation++; this.refresh(); }

  // Like closing an R Commander drop-down menu after choosing an item. Search results
  // stay open: their menus were expanded by the search, not by the user.
  closeMenus() { if (!this.query.trim()) this.collapseAll(); }

  setFilter(query) { this.query = query; this.collapseAll(); }

  // Match accents and case equally, including either language and the menu path.
  matches(node, parents) {
    const fold = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const text = fold([...parents, node.label.en, node.label.es, node.id || ''].join(' '));
    return fold(this.query).trim().split(/\s+/).every(word => text.includes(word));
  }

  getChildren(node) {
    if (node) return node.children || [];
    if (!this.query.trim()) return tree;
    const filter = (nodes, parents = []) => nodes.flatMap(node => {
      if (node.sep) return [];
      if (!node.children) return this.matches(node, parents) ? [node] : [];
      const children = filter(node.children, [...parents, node.label.en, node.label.es]);
      return children.length ? [{ ...node, children }] : [];
    });
    return filter(tree);
  }

  searchItems() {
    const items = [];
    const walk = (nodes, parents = []) => {
      for (const node of nodes) {
        if (node.sep) continue;
        const label = node.label[getLanguage()] || node.label.en;
        if (node.children) walk(node.children, [...parents, label]);
        else items.push({ label, description: parents.join(' ▸ '), detail: node.label.en, alwaysShow: true,
          command: `rcp.cmd.${node.id}` });
      }
    };
    walk(this.getChildren());
    return items;
  }

  dispose() { this.emitter.dispose(); }

  getTreeItem(node) {
    const { TreeItem, TreeItemCollapsibleState, ThemeIcon, ThemeColor } = this.vscode;
    if (node.sep) {
      const line = new TreeItem('────────────', TreeItemCollapsibleState.None);
      line.id = `${this.generation}:${node.key}`;
      line.contextValue = 'separator';
      line.accessibilityInformation = { label: '' };
      return line;
    }
    const label = node.label[getLanguage()] || node.label.en;
    const item = new TreeItem(label, node.children ? (this.query.trim() ? TreeItemCollapsibleState.Expanded : TreeItemCollapsibleState.Collapsed) : TreeItemCollapsibleState.None);
    item.id = `${this.generation}:${node.key}`;
    item.iconPath = new ThemeIcon(node.icon, node.color ? new ThemeColor(node.color) : undefined);
    if (!node.children) {
      item.command = { command: 'rCommanderPlay.chooseMenuItem', title: label, arguments: [node.id] };
      item.tooltip = label;
    }
    return item;
  }
}

module.exports = { MenuTree };

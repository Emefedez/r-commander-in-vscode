const assert = require('node:assert/strict');
const { MenuTree } = require('../lib/tree');
const { setLanguage } = require('../lib/i18n');
const vscode = {
  EventEmitter: class { constructor() { this.event = () => {}; } fire() {} dispose() {} },
  TreeItem: class { constructor(label, collapsibleState) { Object.assign(this, { label, collapsibleState }); } },
  ThemeIcon: class {}, ThemeColor: class {},
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 }
};
const menu = new MenuTree(vscode);
setLanguage('es');
const all = menu.searchItems();
assert.ok(all.length > 350);
menu.setFilter('  REGRESION   LINEAL  ');
assert.ok(menu.searchItems().some(item => item.command === 'rcp.cmd.linearRegressionModel'));
assert.ok(menu.getChildren().every(node => !node.sep));
assert.equal(menu.getTreeItem(menu.getChildren().find(node => node.children)).collapsibleState, 2);
menu.setFilter('statistics means');
assert.ok(menu.searchItems().some(item => item.command === 'rcp.cmd.singleSampleTTest'), 'English ancestor paths match in Spanish');
menu.setFilter('hipotesis varianza');
assert.ok(menu.searchItems().length > 0, 'accents and multiple words match');
menu.setFilter('singleSampleTTest');
assert.deepEqual(menu.searchItems().map(item => item.command), ['rcp.cmd.singleSampleTTest']);
menu.setFilter('no-such-menu-item');
assert.deepEqual(menu.getChildren(), []);
menu.setFilter('');
assert.deepEqual(menu.searchItems(), all, 'clearing restores every command and its path');
setLanguage('en');
menu.setFilter('regresion lineal');
assert.ok(menu.searchItems().some(item => item.label === 'Linear regression...'), 'Spanish search works with English labels');
{
  // Closing the menus gives every item a new id, so VS Code shows them collapsed again;
  // under a search nothing changes, its menus stay expanded.
  const ids = () => menu.getChildren().map(node => menu.getTreeItem(node).id);
  menu.setFilter('');
  const before = ids();
  assert.equal(new Set(before).size, before.length, 'ids are unique');
  const nested = menu.getChildren().find(node => node.children).children;
  const nestedIds = nested.map(node => menu.getTreeItem(node).id);
  assert.equal(new Set([...before, ...nestedIds]).size, before.length + nestedIds.length, 'ids are unique across levels');
  menu.closeMenus();
  const after = ids();
  assert.ok(after.every(id => !before.includes(id)), 'new ids after closing');
  assert.equal(menu.getTreeItem(menu.getChildren().find(node => node.children)).collapsibleState, 1);
  menu.refresh();
  assert.deepEqual(ids(), after, 'a plain refresh (language change) keeps the expanded menus');
  menu.setFilter('regresion lineal');
  const searched = ids();
  menu.closeMenus();
  assert.deepEqual(ids(), searched, 'search results stay expanded');
  const leaf = menu.searchItems()[0];
  let node = menu.getChildren()[0];
  while (node.children) node = node.children[0];
  assert.deepEqual(menu.getTreeItem(node).command.arguments, [leaf.command.replace('rcp.cmd.', '')]);
  assert.equal(menu.getTreeItem(node).command.command, 'rCommanderPlay.chooseMenuItem');
  menu.setFilter('');
}
menu.dispose();
console.log('Menu search filters paths, accents, either language and command IDs; menus close after a choice.');

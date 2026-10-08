const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const uri = { scheme: 'file', toString: () => 'file:///test/script.R' };
const settings = { loadRcmdrFunctions: false, skipHelp: true, skipCommands: [], limitOutput: false, maxOutputItems: 24 };
const handlers = {}, sent = [], notifications = [], treeViews = {}, editorListeners = [];
let hoverRegistrations = 0, hoverDisposals = 0;
let input, onConfigurationChange;
const document = {
  languageId: 'r', uri, save: async () => true,
  getText: () => '?sample\nplay_value <- rep(TRUE,200)\nplay_value'
};
const editor = { document, selections: [{ isEmpty: true }] };
const mock = {
  env: { language: 'en' },
  languages: { registerHoverProvider: () => { hoverRegistrations++; return { dispose() { hoverDisposals++; } }; } },
  EventEmitter: class { constructor() { this.event = () => ({}); } fire() {} },
  TreeItem: class { constructor(label, state) { this.label = label; this.state = state; } },
  ThemeIcon: class { constructor(id, color) { this.id = id; this.color = color; } },
  ThemeColor: class { constructor(id) { this.id = id; } },
  TreeItemCollapsibleState: { None: 0, Collapsed: 1 },
  ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
  StatusBarAlignment: { Right: 2 },
  workspace: {
    isTrusted: true, workspaceFolders: [{}], getWorkspaceFolder: resource => resource === uri ? {} : undefined,
    onDidChangeConfiguration: callback => { onConfigurationChange = callback; return {}; },
    getConfiguration: (section, resource) => {
      assert.equal(section, 'rCommanderPlay');
      assert.equal(resource, uri);
      return {
        get: (key, fallback) => settings[key] ?? fallback,
        update: async (key, value, target) => {
          assert.equal(target, 3);
          settings[key] = value;
          onConfigurationChange({ affectsConfiguration: () => true });
        }
      };
    }
  },
  window: {
    activeTextEditor: editor, visibleTextEditors: [editor],
    createStatusBarItem: () => ({ show() {}, hide() {}, dispose() {} }),
    createTreeView: (id, options) => { treeViews[id] = options.treeDataProvider; return {}; },
    onDidChangeActiveTextEditor: callback => { editorListeners.push(callback); return {}; },
    showInformationMessage: async message => notifications.push(message),
    showErrorMessage: async message => { throw Error(message); },
    showInputBox: async () => input
  },
  commands: {
    registerCommand: (name, handler) => { handlers[name] = handler; return {}; },
    executeCommand: async (name, argument) => {
      if (handlers[name]) return handlers[name](argument);
      assert.equal(name, 'r.runCommand');
      sent.push(argument);
    }
  }
};
const original = Module._load;
Module._load = function(name, ...args) {
  return name === 'vscode' ? mock : original.call(this, name, ...args);
};
require('../extension').activate({ subscriptions: [], asAbsolutePath: file => path.resolve(__dirname, '..', file) });
Module._load = original;
for (const id of Object.keys(require('../data/commands.json'))) {
  assert.equal(typeof handlers[`rcp.cmd.${id}`], 'function', `rcp.cmd.${id} is not registered`);
}
assert.equal(typeof handlers['rCommanderPlay.setLanguage'], 'function');
assert.equal(typeof handlers['rCommanderPlay.clearTerminal'], 'function');
{
  // The menu hover must stay on top: it is registered again whenever an R file is activated.
  assert.equal(hoverRegistrations, 1);
  editorListeners.forEach(listener => listener(editor));
  assert.equal(hoverRegistrations, 2, 'registered again for an R editor');
  assert.equal(hoverDisposals, 1, 'the previous registration is disposed, not stacked');
  editorListeners.forEach(listener => listener({ document: { languageId: 'python' } }));
  assert.equal(hoverRegistrations, 2, 'other languages do not re-register');
}
{
  // The sidebar tree lists the nine menus and its leaves run registered commands.
  const provider = treeViews.rCommanderMenu;
  const top = provider.getChildren();
  assert.ok(top.length >= 9, 'sidebar tree has the menus');
  const leaves = [];
  let separators = 0;
  const walk = node => { if (node.sep) separators++; else if (node.children) node.children.forEach(walk); else leaves.push(node); };
  top.forEach(walk);
  assert.ok(separators >= 5, 'groups are separated');
  const colored = top.filter(n => !n.sep && n.children).map(n => provider.getTreeItem(n).iconPath);
  assert.ok(colored.length >= 9 && colored.every(icon => icon.color?.id), 'every menu has a coloured icon');
  assert.equal(new Set(colored.map(icon => icon.color.id)).size >= 6, true, 'menus use different colours');
  assert.equal(provider.getTreeItem({ sep: true }).command, undefined, 'a separator runs nothing');
  assert.ok(leaves.length >= 240);
  for (const leaf of leaves) assert.ok(handlers[provider.getTreeItem(leaf).command.command], leaf.id);
}

async function runAndRead() {
  await handlers['rCommanderPlay.run'](uri);
  const result = spawnSync('Rscript', ['--vanilla', '-e', sent.at(-1)], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result;
}

(async () => {
  // Menu commands retain the file's settings when the terminal has focus.
  mock.window.activeTextEditor = undefined;
  input = '12';
  await handlers['rCommanderPlay.configureOutputLimit'](uri);
  assert.equal(settings.maxOutputItems, 12);
  assert.equal(settings.limitOutput, true);
  assert.match(notifications.at(-1), /Preview enabled: 12/);
  assert.match((await runAndRead()).stdout, /omitted 188 entries/);

  await handlers['rCommanderPlay.toggleLimitOutput'](uri);
  assert.equal(settings.limitOutput, false);
  assert.doesNotMatch((await runAndRead()).stdout, /omitted/);
  await handlers['rCommanderPlay.toggleLimitOutput'](uri);
  assert.match((await runAndRead()).stdout, /omitted 188 entries/);

  // The latest skip options are used on every run.
  await handlers['rCommanderPlay.toggleSkipHelp'](uri);
  assert.equal(settings.skipHelp, false);
  input = '?';
  await handlers['rCommanderPlay.configureSkippedCommands'](uri);
  const custom = await runAndRead();
  assert.match(custom.stderr, /help skipping OFF; skipping \?/);
  assert.match(custom.stderr, /Skipped: \?/);
  input = undefined;
  await handlers['rCommanderPlay.configureOutputLimit'](uri);
  assert.equal(settings.maxOutputItems, 12);
  console.log('Editor settings changes apply to subsequent R runs, including with terminal focus.');
})().catch(error => { console.error(error); process.exitCode = 1; });

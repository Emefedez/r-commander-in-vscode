#!/usr/bin/env node
// Generates package.json (commands, submenus, menus), the EN/ES manifest strings
// and the runtime data from Rcmdr's own menu definition and Spanish translation.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const catalog = require('../catalog');
const { collect } = require('./functions');
const manual = require('../i18n/es.manual.json');

// --- Rcmdr's Spanish catalog (gettext .po) -----------------------------------
function readPo(file) {
  const entries = {};
  let key = null, field = null;
  const unquote = s => JSON.parse(s);
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (line.startsWith('msgid ')) { key = unquote(line.slice(6)); field = 'id'; entries[key] = ''; }
    else if (line.startsWith('msgstr ')) { field = 'str'; entries[key] = unquote(line.slice(7)); }
    else if (line.startsWith('"') && key !== null) {
      if (field === 'id') { delete entries[key]; key += unquote(line); entries[key] = ''; } else entries[key] += unquote(line);
    }
  }
  delete entries[''];
  return entries;
}
const po = readPo(path.join(__dirname, 'Rcmdr-es.po'));
const poPlugin = readPo(path.join(__dirname, 'TeachStat-es.po'));
// Dialog strings: i18n/es.manual.json first (fixes Rcmdr wording that is hard to understand).
const exact = en => manual[en] || po[en] || poPlugin[en] || undefined;
// As R's gettext(): leading and trailing white space is ignored when looking up, and put back afterwards.
const spanish = en => {
  if (exact(en)) return exact(en);
  const [, before, core, after] = /^(\s*)([\s\S]*?)(\s*)$/.exec(en);
  const found = core && core !== en ? exact(core) : undefined;
  return found ? before + found + after : undefined;
};
// Menu titles keep R Commander's exact wording, translated as its gettextMenus() does (Rcmdr's catalog,
// then the plug-in's on the result); what R Commander leaves in English stays in English.
const spanishOf = item => { const rcmdr = po[item.label] || item.label; return poPlugin[rcmdr] || (rcmdr !== item.label ? rcmdr : undefined); };

// --- Rcmdr menu definition ----------------------------------------------------
const menus = {};      // menu name -> ordered items
const tokens = line => [...line.matchAll(/"([^"]*)"|(\S+)/g)].map(m => m[1] ?? m[2]);
// Rcmdr's own menus, then the ones the RcmdrPlugin.TeachStat plug-in adds (as in the user's R Commander).
for (const [file, source] of [['Rcmdr-menus.txt', 'rcmdr'], ['TeachStat-menus.txt', 'plugin']]) {
  for (const raw of fs.readFileSync(path.join(__dirname, file), 'utf8').split('\n')) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    const [type, name, op, label, target] = tokens(raw);
    if (type === 'menu') menus[name] = menus[name] || [];
    else if (type === 'item') {
      menus[name] = menus[name] || [];
      if (op === 'command') menus[name].push({ kind: 'command', id: target, label, source });
      else if (op === 'cascade') menus[name].push({ kind: 'submenu', menu: target, label, source });
      else if (op === 'separator') menus[name].push({ kind: 'sep', source });
    }
  }
}
// The plug-in's top-level menus sit before Tools, as in the menu bar of R Commander.
{
  const top = menus.topMenu;
  const plugin = top.filter(i => i.source === 'plugin');
  const rest = top.filter(i => i.source !== 'plugin');
  const at = rest.findIndex(i => i.kind === 'submenu' && i.menu === 'toolsMenu');
  menus.topMenu = [...rest.slice(0, at), ...plugin, ...rest.slice(at)];
}

// Items that Rcmdr does not have or that make no sense outside its window.
const extras = { toolbar: [] };
for (const [id, spec] of Object.entries(catalog)) if (spec.extraIn) (extras[spec.extraIn] ||= []).push({ kind: 'command', id, label: spec.label.en, es: spec.label.es });
for (const [menu, items] of Object.entries(extras)) if (menu !== 'toolbar') menus[menu].push(...(menu === 'toolsMenu' ? [{ kind: 'sep' }] : []), ...items);
const TOOLBAR = ['selectActiveDataSet', 'editDataSet', 'viewDataSet', 'selectActiveModel'];
const skipped = new Set();

const labels = {};        // id -> English label
const spanishLabels = {};
const targets = {};       // alias command id -> the command it runs
const firstLabel = {}, aliasCount = {};
// A command that appears in two menus under different names (the plug-in renames some) gets an alias per name,
// so each menu entry can have its own label; the alias runs the same command.
const occurrence = item => {
  if (firstLabel[item.id] === undefined) { firstLabel[item.id] = item.label; return item.id; }
  if (firstLabel[item.id] === item.label) return item.id;
  const alias = `${item.id}@${(aliasCount[item.id] = (aliasCount[item.id] || 0) + 1) + 1}`;
  targets[alias] = item.id;
  return alias;
};
const commandLabel = item => { const key = item.occ || item.id; labels[key] = labels[key] || item.label; spanishLabels[key] = spanishLabels[key] || item.es || spanishOf(item); };

// Keeps implemented commands only; drops submenus left empty.
function prune(name, seen = new Set()) {
  const out = [];
  for (const item of menus[name] || []) {
    if (item.kind === 'command') {
      if (catalog[item.id]) { const entry = { ...item, occ: occurrence(item) }; out.push(entry); commandLabel(entry); } else skipped.add(`${item.id} (${item.label})`);
    } else if (item.kind === 'submenu') {
      if (seen.has(item.menu)) continue;
      const children = prune(item.menu, new Set([...seen, name]));
      if (children.length) out.push({ ...item, children });
    } else if (out.length && out[out.length - 1].kind !== 'sep') out.push(item);
  }
  while (out.length && out[out.length - 1].kind === 'sep') out.pop();
  return out;
}

const submenus = [{ id: 'rcp.top', label: '%rcp.menu.top%' }];
const menuEntries = {};
const nls = { en: { 'rcp.menu.top': 'R Commander' }, es: { 'rcp.menu.top': 'R Commander' } };
const ids = new Set();

function emit(menuId, items) {
  let group = 1, index = 0;
  const entries = [];
  for (const item of items) {
    if (item.kind === 'sep') { group++; index = 0; continue; }
    const g = `${String(group).padStart(2, '0')}_rcp@${++index}`;
    if (item.kind === 'command') {
      const occ = item.occ || item.id;
      ids.add(occ);
      entries.push({ command: `rcp.cmd.${occ}`, when: 'editorLangId == r', group: g });
    } else {
      const sub = `rcp.${item.menu}`;
      submenus.push({ id: sub, label: `%${sub}%` });
      nls.en[sub] = item.label;
      nls.es[sub] = spanishOf(item) || item.label;
      entries.push({ submenu: sub, when: 'editorLangId == r', group: g });
      emit(sub, item.children);
    }
  }
  menuEntries[menuId] = entries;
}

// The same hierarchy for the sidebar tree view: labels in both languages so the
// tree follows the rCommanderPlay.language setting without a reload.
// Icon and colour of each top-level menu; everything inside inherits its colour, so the
// groups are easy to tell apart. Colours are theme colours, so they follow light/dark.
const MENU_STYLE = {
  fileMenu: ['file', 'charts.blue'], editMenu: ['edit', 'charts.yellow'], dataMenu: ['database', 'charts.green'],
  statisticsMenu: ['graph', 'charts.purple'], graphsMenu: ['graph-line', 'charts.orange'], modelsMenu: ['beaker', 'charts.red'],
  distributionsMenu: ['pulse', 'terminal.ansiCyan'], EstadisticaUvigoMenu: ['book', 'terminal.ansiYellow'], toolsMenu: ['tools', 'terminal.ansiMagenta'], helpMenu: ['question', 'terminal.ansiBlue']
};
const TOOLBAR_STYLE = { selectActiveDataSet: 'database', editDataSet: 'edit', viewDataSet: 'eye', selectActiveModel: 'beaker' };
const label2 = (en, es) => ({ en, es: es || en });
function treeNode(item, color, depth) {
  if (item.kind === 'sep') return { sep: true };
  const [icon, own] = depth === 0 && MENU_STYLE[item.menu] ? MENU_STYLE[item.menu] : [undefined, color];
  if (item.kind === 'command') {
    const occ = item.occ || item.id;
    return { id: occ, ...(occ !== item.id && { target: item.id }), color: item.id === 'selectActiveModel' ? 'charts.red' : own || 'charts.green', icon: TOOLBAR_STYLE[item.id] || 'circle-filled',
      label: label2(labels[occ] || item.label, spanishLabels[occ] || item.es || spanishOf(item) || item.label) };
  }
  return { label: label2(item.label, spanishOf(item) || item.label), color: own, icon: icon || 'folder',
    children: treeOf(item.children, own, depth + 1) };
}
// Separators of the Rcmdr menus become a thin gap between groups.
function treeOf(items, color, depth = 0) {
  const nodes = items.map(i => treeNode(i, color, depth));
  return nodes.filter((n, i) => !n.sep || (i > 0 && !nodes[i - 1].sep && i < nodes.length - 1));
}

const top = [];
for (const id of TOOLBAR) {
  const item = { kind: 'command', id, label: catalog[id].label?.en };
  if (!catalog[id]) continue;
  const found = Object.values(menus).flat().find(i => i.kind === 'command' && i.id === id);
  top.push({ kind: 'command', id, label: item.label || found.label, es: catalog[id].label?.es });
}
top.push({ kind: 'sep' });
for (const item of menus.topMenu) top.push({ ...item, children: prune(item.menu) });
const topPruned = top.filter(i => i.kind !== 'submenu' || i.children.length);
top.length = 0;
for (const item of topPruned) { if (item.kind === 'command') commandLabel(item); top.push(item); }
emit('rcp.top', top);
const tree = treeOf(top, 'charts.green');

// --- package.json -------------------------------------------------------------
const base = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.base.json'), 'utf8'));
const pkg = JSON.parse(JSON.stringify(base));
pkg.version = '0.5.0';
pkg.description = 'Run R code with visible output from a green play button, and use the R Commander menus (File, Data, Statistics, Graphs, Models, Distributions...) from the editor, in English or Spanish.';
const COMMAND_ICONS = { installPackages: '$(package)' };
pkg.contributes.commands = [...base.contributes.commands.map(c => ({ ...c, title: `%${c.command}%` })), ...[...ids].map(id => ({
  command: `rcp.cmd.${id}`, title: `%rcp.cmd.${id}%`, category: 'R Commander', enablement: 'isWorkspaceTrusted',
  ...(COMMAND_ICONS[id] && { icon: COMMAND_ICONS[id] })
}))];
pkg.contributes.commands.push({ command: 'rCommanderPlay.setLanguage', title: '%rCommanderPlay.setLanguage%', category: 'R Commander' });
pkg.contributes.submenus = submenus;
// Shown in the R extension's own sidebar (activity bar container "workspaceViewer").
pkg.contributes.views = { workspaceViewer: [{ id: 'rCommanderMenu', name: 'R Commander' }] };
pkg.activationEvents = [...new Set([...(base.activationEvents || []), 'onView:rCommanderMenu'])];
const ours = new Set(['rCommanderPlay.run', 'rCommanderPlay.clearTerminal', 'rCommanderPlay.interruptR']);
const title = pkg.contributes.menus['editor/title'].filter(m => !ours.has(m.command));
// The Interactive Window of an arf session (same condition the R extension uses for its own toolbar items).
const arfWindow = "notebookType == interactive && notebookKernel =~ /^REditorSupport[.]r\\/r-/i";
pkg.contributes.menus = {
  ...menuEntries,
  // VS Code's "Run or Debug" split button (Run Source lives in it) is navigation@-1;
  // -2 puts the green button directly to its left without taking over that button.
  'editor/title': [
    { command: 'rCommanderPlay.clearTerminal', when: 'editorLangId == r', group: 'navigation@-3' },
    { command: 'rCommanderPlay.run', when: 'editorLangId == r && isWorkspaceTrusted', group: 'navigation@-2' },
    { submenu: 'rcp.top', when: 'editorLangId == r', group: '1_rcommander@1' }, ...title],
  // The arf panel's own "..." menu (an Interactive Window driven by the R extension's controller).
  'interactive/toolbar': [
    // R Play's own settings from the arf panel: the quick settings bar (a button) and the full settings form.
    { command: 'rCommanderPlay.showSettings', when: arfWindow, group: 'navigation/rplay@0' },
    { command: 'rCommanderPlay.openSettingsForm', when: arfWindow, group: 'rplay_settings@1' },
    // Long results: the short preview (a button) and collapsing or scrolling the outputs that are printed.
    { command: 'rCommanderPlay.toggleLimitOutput', when: arfWindow, group: 'navigation/rplay@1' },
    { command: 'rCommanderPlay.toggleFixedNotation', when: arfWindow, group: 'rplay_output@0' },
    { command: 'rCommanderPlay.configureOutputLimit', when: arfWindow, group: 'rplay_output@1' },
    { command: 'rCommanderPlay.toggleArfScrollOutput', when: arfWindow, group: 'rplay_output@2' },
    { command: 'notebook.cell.collapseAllCellOutputs', when: arfWindow, group: 'rplay_output@3' },
    { command: 'notebook.cell.expandAllCellOutputs', when: arfWindow, group: 'rplay_output@4' },
    { command: 'rCommanderPlay.toggleArfWordWrap', when: arfWindow, group: 'rplay_arf@1' },
    { command: 'rCommanderPlay.toggleArfPanelLayout', when: arfWindow, group: 'rplay_arf@2' },
    { command: 'rCommanderPlay.runInTerminal', when: `${arfWindow} && config.rCommanderPlay.runTarget != terminal`, group: 'rplay_arf@3' }],
  // The two side-by-side buttons in the R Commander sidebar header (keeps the editor toolbar short).
  'view/title': [
    { command: 'rCommanderPlay.interruptR', when: 'view == rCommanderMenu', group: 'navigation@1' },
    { command: 'rcp.cmd.installPackages', when: 'view == rCommanderMenu', group: 'navigation@2' },
    { command: 'rCommanderPlay.searchMenus', when: 'view == rCommanderMenu', group: 'navigation@3' },
    { command: 'rCommanderPlay.clearMenuSearch', when: 'view == rCommanderMenu', group: 'navigation@4' },
    // Buttons in the R extension's Interactive Sessions view: where R code runs. Each shows while it is not the current target.
    { command: 'rCommanderPlay.runInArf', when: 'view == rInteractiveSessions && config.rCommanderPlay.runTarget != arf', group: 'navigation@90' },
    { command: 'rCommanderPlay.runInTerminal', when: 'view == rInteractiveSessions && config.rCommanderPlay.runTarget != terminal', group: 'navigation@91' },
    // Options of the arf panel itself: its own "..." toolbar menu once open, and the Interactive Sessions "..." menu.
    { command: 'rCommanderPlay.showSettings', when: 'view == rInteractiveSessions', group: 'arf_options@-1' },
    { command: 'rCommanderPlay.openSettingsForm', when: 'view == rInteractiveSessions', group: 'arf_options@-1' },
    { command: 'rCommanderPlay.toggleLimitOutput', when: 'view == rInteractiveSessions', group: 'arf_options@0' },
    { command: 'rCommanderPlay.toggleArfScrollOutput', when: 'view == rInteractiveSessions', group: 'arf_options@0' },
    { command: 'rCommanderPlay.toggleArfWordWrap', when: 'view == rInteractiveSessions', group: 'arf_options@1' },
    { command: 'rCommanderPlay.toggleArfPanelLayout', when: 'view == rInteractiveSessions', group: 'arf_options@2' },
    // In the header's "..." menu, with a check mark while enabled.
    { command: 'rCommanderPlay.toggleCloseMenus', when: 'view == rCommanderMenu', group: '1_menus@1' },
    { command: 'rCommanderPlay.toggleInsertInScript', when: 'view == rCommanderMenu', group: '1_menus@2' }]
};
pkg.contributes.configuration.properties['rCommanderPlay.language'] = {
  type: 'string', enum: ['es', 'en', 'auto'], default: 'es', scope: 'window',
  enumDescriptions: ['Español', 'English', 'Follow the VS Code display language'],
  description: 'Language of the R Commander dialogs. Menu labels follow the VS Code display language (use "R Commander: Set Language" to switch them too).'
};
pkg.contributes.configuration.properties['rCommanderPlay.loadRcmdrFunctions'] = {
  type: 'boolean', default: true, scope: 'resource',
  description: 'Make the functions of R Commander and its plug-ins (Recode, Hist, calcular_frecuencia...) available in the R session before running code, without opening the R Commander window.'
};
pkg.contributes.configuration.properties['rCommanderPlay.rcmdrPlugins'] = {
  type: 'array', items: { type: 'string' }, default: [], scope: 'resource',
  description: 'R Commander plug-ins to load, for example RcmdrPlugin.TeachStat. Empty loads every installed RcmdrPlugin.* package.'
};
pkg.contributes.configuration.properties['rCommanderPlay.cranMirror'] = {
  type: 'string', default: 'https://cloud.r-project.org', scope: 'window',
  description: 'CRAN mirror used by the package installer when R has no repository configured. "Tools > Set CRAN mirror..." changes it.'
};
pkg.contributes.configuration.properties['rCommanderPlay.packageDownloads'] = {
  type: 'string', default: '~/.cache/r-commander-play/packages', scope: 'window',
  description: 'Permanent folder where the package installer keeps the downloaded files. It doubles as a small local repository that is checked before CRAN, so a package already downloaded is not downloaded again.'
};
pkg.contributes.configuration.properties['rCommanderPlay.dialogStyle'] = {
  type: 'string', enum: ['form', 'steps'], default: 'form', scope: 'window',
  enumDescriptions: ['One window with every option at once, like R Commander', 'One question at a time in the top bar'],
  description: 'How the R Commander menus ask for their options.'
};
pkg.contributes.configuration.properties['rCommanderPlay.menuAction'] = {
  type: 'string', enum: ['run', 'insert', 'both'], default: 'both', scope: 'window',
  enumDescriptions: ['Run the generated R code in R (terminal or arf panel, see Run Target)', 'Only insert the generated code at the end of the R script', 'Insert it in the script and run it'],
  description: 'What the R Commander menus do with the R code they generate. "both" pastes it into the R script and runs it, like the script window of R Commander.'
};
pkg.contributes.configuration.properties['rCommanderPlay.runTarget'] = {
  type: 'string', enum: ['auto', 'terminal', 'arf'], default: 'auto', scope: 'window',
  enumDescriptions: ['Follow the R extension (the selected Interactive session, else the R terminal)', 'Always the R terminal', 'Always the arf Interactive panel (offers to start one if none is open)'],
  description: 'Where the green button and the R Commander menus run R code. "terminal" and "arf" set r.interactive.executionTarget of the R extension.'
};

// --- translations --------------------------------------------------------------
for (const [id, label] of Object.entries(labels)) {
  nls.en[`rcp.cmd.${id}`] = label;
  nls.es[`rcp.cmd.${id}`] = spanishLabels[id] || label;
}
for (const [key, en, es] of [
  ['rCommanderPlay.setLanguage', 'Set Language (English / Español)', 'Cambiar idioma (English / Español)']]) { nls.en[key] = en; nls.es[key] = es; }
const baseNls = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.nls.base.json'), 'utf8'));
Object.assign(nls.en, baseNls.en); Object.assign(nls.es, baseNls.es);

// Runtime strings: every English literal given to t() or used as a dialog label.
const strings = new Set();
const fromSource = file => { for (const m of fs.readFileSync(file, 'utf8').matchAll(/\bt\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g)) strings.add(JSON.parse(`"${m[2].replace(/"/g, '\\"').replace(/\\'/g, "'")}"`.replace(/\\`/g, '`'))); };
for (const f of ['../lib/hover.js', '../lib/form.js', '../lib/formmodel.js', '../lib/dialog.js', '../lib/commander.js', '../extension.js', '../catalog/data.js', '../catalog/stats.js', '../catalog/models.js', '../catalog/graphs.js', '../catalog/distributions.js', '../catalog/system.js', '../catalog/teachstat.js', '../catalog/teachstat-data.js', '../catalog/teachstat-index.js', '../catalog/teachstat-inference.js']) fromSource(path.join(__dirname, f));
(function walk(x, key) {
  if (typeof x === 'string') { if (['label', 'error'].includes(key)) strings.add(x); }
  else if (Array.isArray(x)) {
    if (x.length >= 2 && typeof x[0] === 'string' && typeof x[1] === 'string' && key !== 'items') strings.add(x[1]);
    if (key === 'items') x.forEach(i => typeof i[1] === 'string' && strings.add(i[1]));
    x.forEach(i => walk(i, key));
  } else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) if (typeof v !== 'function') walk(v, k);
})(Object.values(catalog).map(spec => ({ fields: spec.fields })), '');
for (const spec of Object.values(catalog)) for (const f of spec.fields || []) if (typeof f.choices === 'function') {
  for (const key of [...Object.keys(spec)]) void key;
}
const es = {};
const missing = [];
for (const s of [...strings].sort()) { const tr = spanish(s); if (tr) es[s] = tr; else missing.push(s); }

const write = (file, data) => fs.writeFileSync(path.join(root, file), JSON.stringify(data, null, '\t') + '\n');
write('package.json', pkg);
write('package.nls.json', nls.es);
write('package.nls.es.json', nls.es);
write('package.nls.en.json', nls.en);
write('i18n/es.json', es);
write('i18n/nls.en.json', nls.en);
write('i18n/nls.es.json', nls.es);
write('data/tree.json', tree);
write('data/functions.json', collect([...ids].filter(id => catalog[id])));
write('data/commands.json', Object.fromEntries([...ids].map(id => [id, { label: labels[id], ...(targets[id] && { target: targets[id] }) }])));
console.log(`commands: ${ids.size}, submenus: ${submenus.length}, runtime strings: ${strings.size}`);
console.log(`not implemented (${skipped.size}):\n  ${[...skipped].join('\n  ')}`);
if (missing.length) fs.writeFileSync(path.join(__dirname, 'missing-es.txt'), missing.join('\n') + '\n');
console.log(`strings without Spanish: ${missing.length}${missing.length ? ' (see build/missing-es.txt)' : ''}`);

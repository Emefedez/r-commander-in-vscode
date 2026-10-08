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
const spanish = en => manual[en] || po[en] || undefined;

// --- Rcmdr menu definition ----------------------------------------------------
const menus = {};      // menu name -> ordered items
const tokens = line => [...line.matchAll(/"([^"]*)"|(\S+)/g)].map(m => m[1] ?? m[2]);
for (const raw of fs.readFileSync(path.join(__dirname, 'Rcmdr-menus.txt'), 'utf8').split('\n')) {
  if (!raw.trim() || raw.trim().startsWith('#')) continue;
  const [type, name, op, label, target] = tokens(raw);
  if (type === 'menu') menus[name] = menus[name] || [];
  else if (type === 'item') {
    menus[name] = menus[name] || [];
    if (op === 'command') menus[name].push({ kind: 'command', id: target, label });
    else if (op === 'cascade') menus[name].push({ kind: 'submenu', menu: target, label });
    else if (op === 'separator') menus[name].push({ kind: 'sep' });
  }
}

// Items that Rcmdr does not have or that make no sense outside its window.
const extras = { toolbar: [] };
for (const [id, spec] of Object.entries(catalog)) if (spec.extraIn) (extras[spec.extraIn] ||= []).push({ kind: 'command', id, label: spec.label.en, es: spec.label.es });
for (const [menu, items] of Object.entries(extras)) if (menu !== 'toolbar') menus[menu].push(...items);
const TOOLBAR = ['selectActiveDataSet', 'editDataSet', 'viewDataSet', 'selectActiveModel'];
const skipped = new Set();

const labels = {};        // id -> English label
const spanishLabels = {};
const commandLabel = item => { labels[item.id] = labels[item.id] || item.label; spanishLabels[item.id] = spanishLabels[item.id] || item.es || spanish(item.label); };

// Keeps implemented commands only; drops submenus left empty.
function prune(name, seen = new Set()) {
  const out = [];
  for (const item of menus[name] || []) {
    if (item.kind === 'command') {
      if (catalog[item.id]) { out.push(item); commandLabel(item); } else skipped.add(`${item.id} (${item.label})`);
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
      ids.add(item.id);
      entries.push({ command: `rcp.cmd.${item.id}`, when: 'editorLangId == r', group: g });
    } else {
      const sub = `rcp.${item.menu}`;
      submenus.push({ id: sub, label: `%${sub}%` });
      nls.en[sub] = item.label;
      nls.es[sub] = spanish(item.label) || item.label;
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
  distributionsMenu: ['pulse', 'terminal.ansiCyan'], toolsMenu: ['tools', 'terminal.ansiMagenta'], helpMenu: ['question', 'terminal.ansiBlue']
};
const TOOLBAR_STYLE = { selectActiveDataSet: 'database', editDataSet: 'edit', viewDataSet: 'eye', selectActiveModel: 'beaker' };
const label2 = (en, es) => ({ en, es: es || en });
function treeNode(item, color, depth) {
  if (item.kind === 'sep') return { sep: true };
  const [icon, own] = depth === 0 && MENU_STYLE[item.menu] ? MENU_STYLE[item.menu] : [undefined, color];
  if (item.kind === 'command') {
    return { id: item.id, color: item.id === 'selectActiveModel' ? 'charts.red' : own || 'charts.green', icon: TOOLBAR_STYLE[item.id] || 'circle-filled',
      label: label2(labels[item.id] || item.label, spanishLabels[item.id] || item.es || spanish(item.label) || item.label) };
  }
  return { label: label2(item.label, spanish(item.label) || item.label), color: own, icon: icon || 'folder',
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
pkg.contributes.commands = [...base.contributes.commands.map(c => ({ ...c, title: `%${c.command}%` })), ...[...ids].map(id => ({
  command: `rcp.cmd.${id}`, title: `%rcp.cmd.${id}%`, category: 'R Commander', enablement: 'isWorkspaceTrusted'
}))];
pkg.contributes.commands.push({ command: 'rCommanderPlay.setLanguage', title: '%rCommanderPlay.setLanguage%', category: 'R Commander' });
pkg.contributes.submenus = submenus;
// Shown in the R extension's own sidebar (activity bar container "workspaceViewer").
pkg.contributes.views = { workspaceViewer: [{ id: 'rCommanderMenu', name: 'R Commander' }] };
pkg.activationEvents = [...new Set([...(base.activationEvents || []), 'onView:rCommanderMenu'])];
const title = pkg.contributes.menus['editor/title'].filter(m => m.command !== 'rCommanderPlay.run' && m.command !== 'rCommanderPlay.clearTerminal');
pkg.contributes.menus = {
  ...menuEntries,
  // VS Code's "Run or Debug" split button (Run Source lives in it) is navigation@-1;
  // -2 puts the green button directly to its left without taking over that button.
  'editor/title': [
    { command: 'rCommanderPlay.clearTerminal', when: 'editorLangId == r', group: 'navigation@-3' },
    { command: 'rCommanderPlay.run', when: 'editorLangId == r && isWorkspaceTrusted', group: 'navigation@-2' },
    { submenu: 'rcp.top', when: 'editorLangId == r', group: '1_rcommander@1' }, ...title]
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
pkg.contributes.configuration.properties['rCommanderPlay.dialogStyle'] = {
  type: 'string', enum: ['form', 'steps'], default: 'form', scope: 'window',
  enumDescriptions: ['One window with every option at once, like R Commander', 'One question at a time in the top bar'],
  description: 'How the R Commander menus ask for their options.'
};
pkg.contributes.configuration.properties['rCommanderPlay.menuAction'] = {
  type: 'string', enum: ['run', 'insert', 'both'], default: 'run', scope: 'window',
  enumDescriptions: ['Run the generated R code in the R terminal', 'Only insert the generated code at the end of the R script', 'Insert it in the script and run it'],
  description: 'What the R Commander menus do with the R code they generate.'
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
for (const f of ['../lib/hover.js', '../lib/form.js', '../lib/formmodel.js', '../lib/dialog.js', '../lib/commander.js', '../extension.js', '../catalog/data.js', '../catalog/stats.js', '../catalog/models.js']) fromSource(path.join(__dirname, f));
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
write('data/functions.json', collect([...ids]));
write('data/commands.json', Object.fromEntries([...ids].map(id => [id, { label: labels[id] }])));
console.log(`commands: ${ids.size}, submenus: ${submenus.length}, runtime strings: ${strings.size}`);
console.log(`not implemented (${skipped.size}):\n  ${[...skipped].join('\n  ')}`);
if (missing.length) fs.writeFileSync(path.join(__dirname, 'missing-es.txt'), missing.join('\n') + '\n');
console.log(`strings without Spanish: ${missing.length}${missing.length ? ' (see build/missing-es.txt)' : ''}`);

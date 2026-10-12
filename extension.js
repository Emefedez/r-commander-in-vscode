const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const commands = require('./data/commands.json');
const { Commander } = require('./lib/commander');
const { MenuTree } = require('./lib/tree');
const { MenuHover } = require('./lib/hover');
const { RSession } = require('./lib/rsession');
const { t, setLanguage, resolveLanguage } = require('./lib/i18n');

let lastRResource;

function resourceFor(resource) {
  if (resource?.scheme) return resource;
  const editor = vscode.window.activeTextEditor;
  if (editor?.document.languageId === 'r') return editor.document.uri;
  return lastRResource;
}

function configuration(resource) {
  return vscode.workspace.getConfiguration('rCommanderPlay', resourceFor(resource));
}

function configurationTarget(resource) {
  const uri = resourceFor(resource);
  if (uri && vscode.workspace.getWorkspaceFolder(uri)) {
    return vscode.ConfigurationTarget.WorkspaceFolder;
  }
  return vscode.workspace.workspaceFolders?.length
    ? vscode.ConfigurationTarget.Workspace
    : vscode.ConfigurationTarget.Global;
}

// The R terminal that REditorSupport.r manages.
const rTerminal = () => (vscode.window.terminals || []).find(terminal => /^R\b/.test(terminal.name));

function activate(context) {
  // One channel to the R terminal, shared by the green button and the R Commander menus.
  const session = new RSession(vscode, context.asAbsolutePath('runner.R'));
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 10);
  status.command = 'rCommanderPlay.showSettings';
  const refresh = () => {
    const editor = vscode.window.activeTextEditor;
    if (editor?.document.languageId === 'r') lastRResource = editor.document.uri;
    const config = configuration();
    const preview = config.get('limitOutput', true)
      ? `preview ${config.get('maxOutputItems', 24)}` : 'full output';
    const skipped = [...(config.get('skipHelp', true) ? ['help'] : []), ...config.get('skipCommands', [])];
    status.text = `R Play: ${preview}${skipped.length ? ' · skips ' + skipped.join(', ') : ''}`;
    status.tooltip = 'Settings for the green R play button. Click to configure. Changes apply on the next run.';
    if (editor?.document.languageId === 'r') status.show();
    else status.hide();
  };
  const update = async (resource, key, value, message) => {
    const uri = resourceFor(resource);
    await configuration(uri).update(key, value, configurationTarget(uri));
    refresh();
    await vscode.window.showInformationMessage(`R Play: ${message} Applies on the next green ▶ run.`);
  };
  refresh();
  registerMenus(context, resourceFor, configuration, refresh, session);
  context.subscriptions.push(status,
    // Clears the R terminal even when the editor has the focus.
    vscode.commands.registerCommand('rCommanderPlay.clearTerminal', async () => {
      rTerminal()?.show(true);
      await vscode.commands.executeCommand('workbench.action.terminal.clear');
    }),
    // Ctrl+C in the R terminal: stops what R is running, like the Stop button of R's own GUIs.
    vscode.commands.registerCommand('rCommanderPlay.interruptR', async () => {
      const terminal = rTerminal();
      if (!terminal) { await vscode.window.showInformationMessage(t('There is no R terminal open.')); return; }
      terminal.sendText('\x03', false);
      terminal.show(true);
    }),
    vscode.window.onDidChangeActiveTextEditor(refresh),
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('rCommanderPlay')) refresh();
    }));
  context.subscriptions.push(
    vscode.commands.registerCommand('rCommanderPlay.run', async resource => {
      const uri = resourceFor(resource);
      const editor = vscode.window.visibleTextEditors.find(editor => editor.document.uri.toString() === uri?.toString())
        || vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'r' || !vscode.workspace.isTrusted) {
        return;
      }

      try {
        const selections = editor.selections.filter(selection => !selection.isEmpty);
        if (!selections.length && !(await editor.document.save())) {
          return;
        }
        const code = selections.length
          ? selections.map(selection => editor.document.getText(selection)).join('\n')
          : editor.document.getText();
        if (!code.trim()) return;

        const config = configuration(editor.document.uri);
        const configuredMax = Number(config.get('maxOutputItems', 24));
        await session.run(code, { settings: {
          skipHelp: config.get('skipHelp', true), skipCommands: config.get('skipCommands', []),
          limitOutput: config.get('limitOutput', true),
          syntaxColors: config.get('syntaxColors', false),
          maxOutputItems: Number.isInteger(configuredMax) && configuredMax >= 1 && configuredMax <= 1000000 ? configuredMax : 24,
          loadRcmdrFunctions: config.get('loadRcmdrFunctions', true), rcmdrPlugins: config.get('rcmdrPlugins', [])
        } });
      } catch (error) {
        await vscode.window.showErrorMessage(`Could not run R code: ${error.message || error}`);
      }
    }),
    vscode.commands.registerCommand('rCommanderPlay.toggleSkipHelp', async resource => {
      const enabled = !configuration(resource).get('skipHelp', true);
      await update(resource, 'skipHelp', enabled, `Help-command skipping ${enabled ? 'enabled' : 'disabled'}.`);
    }),
    vscode.commands.registerCommand('rCommanderPlay.toggleLimitOutput', async resource => {
      const enabled = !configuration(resource).get('limitOutput', true);
      await update(resource, 'limitOutput', enabled, `Output preview ${enabled ? 'enabled' : 'disabled'}.`);
    }),
    vscode.commands.registerCommand('rCommanderPlay.toggleSyntaxColors', async resource => {
      const enabled = !configuration(resource).get('syntaxColors', false);
      await update(resource, 'syntaxColors', enabled, enabled ? t('Syntax colors enabled.') : t('Syntax colors disabled.'));
    }),
    vscode.commands.registerCommand('rCommanderPlay.configureOutputLimit', async resource => {
      const uri = resourceFor(resource);
      const config = configuration(uri);
      const value = await vscode.window.showInputBox({
        title: 'R: Output Preview Size',
        prompt: 'Maximum number of printed entries per result (1–1000000). Turn off Limit Long Output for normal output.',
        value: String(config.get('maxOutputItems', 24)),
        validateInput: value => /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 1000000
          ? undefined : 'Enter a whole number between 1 and 1000000.'
      });
      if (value === undefined) return;
      await configuration(uri).update('maxOutputItems', Number(value), configurationTarget(uri));
      await update(uri, 'limitOutput', true, `Preview enabled: ${value} entries per result.`);
    }),
    vscode.commands.registerCommand('rCommanderPlay.configureSkippedCommands', async resource => {
      const uri = resourceFor(resource);
      const config = configuration(uri);
      const value = await vscode.window.showInputBox({
        title: 'R: Commands to Skip',
        prompt: 'Comma-separated standalone commands to skip, for example fix, View, utils::example. Leave empty to skip none.',
        value: config.get('skipCommands', []).join(', ')
      });
      if (value === undefined) return;
      const commands = [...new Set(value.split(',').map(command => command.trim()).filter(Boolean))];
      await update(uri, 'skipCommands', commands, commands.length ? `Skipping ${commands.join(', ')}.` : 'Custom command skipping cleared.');
    }),
    vscode.commands.registerCommand('rCommanderPlay.showSettings', async resource => {
      const uri = resourceFor(resource);
      const config = configuration(uri);
      const chosen = await vscode.window.showQuickPick([
        { label: t('Syntax colors: {0}', config.get('syntaxColors', false) ? 'ON' : 'OFF'), description: t('Color the R code echoed in the terminal'), command: 'rCommanderPlay.toggleSyntaxColors' },
        { label: `Output preview: ${config.get('limitOutput', true) ? 'ON' : 'OFF'}`, description: 'Toggle short previews of long results', command: 'rCommanderPlay.toggleLimitOutput' },
        { label: `Preview size: ${config.get('maxOutputItems', 24)} entries`, description: 'Choose a size and enable previews', command: 'rCommanderPlay.configureOutputLimit' },
        { label: `Skip help: ${config.get('skipHelp', true) ? 'ON' : 'OFF'}`, description: 'Toggle skipping ?topic, ??topic and help()', command: 'rCommanderPlay.toggleSkipHelp' },
        { label: 'Other commands to skip', description: config.get('skipCommands', []).join(', ') || 'None', command: 'rCommanderPlay.configureSkippedCommands' }
      ], { title: 'Green R Play Button Settings' });
      if (chosen) await vscode.commands.executeCommand(chosen.command, uri);
    })
  );
}

// The R Commander menus: every command asks for its options, generates R code
// and runs it in the R terminal.
function registerMenus(context, resourceFor, configuration, refreshPlayStatus, session) {
  const applyLanguage = () => setLanguage(resolveLanguage(configuration().get('language', 'es'), vscode.env.language));
  applyLanguage();
  const commander = new Commander({
    vscode, session,
    resource: () => resourceFor(),
    settings: () => {
      const config = configuration();
      return {
        limitOutput: config.get('limitOutput', true), maxOutputItems: Number(config.get('maxOutputItems', 24)),
        syntaxColors: config.get('syntaxColors', false),
        menuAction: config.get('menuAction', 'run'), dialogStyle: config.get('dialogStyle', 'form'),
        cranMirror: config.get('cranMirror', 'https://cloud.r-project.org'),
        packageDownloads: config.get('packageDownloads', '~/.cache/r-commander-play/packages'),
        loadRcmdrFunctions: config.get('loadRcmdrFunctions', true), rcmdrPlugins: config.get('rcmdrPlugins', [])
      };
    },
    updateSetting: (key, value) => configuration().update(key, value, vscode.ConfigurationTarget.Global),
    notify: (text, level) => (level === 'warn' ? vscode.window.showWarningMessage(text) : vscode.window.showInformationMessage(text))
  });

  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 9);
  status.command = 'rcp.cmd.selectActiveDataSet';
  const show = () => {
    const editor = vscode.window.activeTextEditor;
    status.text = `R Commander: ${t('Data set')}: ${commander.activeDataset || '—'} · ${t('Model')}: ${commander.activeModel || '—'}`;
    status.tooltip = t('Active data set and model. Click to select the data set.');
    if (editor?.document.languageId === 'r') status.show(); else status.hide();
  };
  commander.onChange = show;
  show();

  const menuTree = new MenuTree(vscode);
  const menuView = vscode.window.createTreeView('rCommanderMenu', { treeDataProvider: menuTree });
  const filterMenus = query => {
    menuTree.setFilter(query);
    menuView.description = query.trim() || undefined;
    menuView.message = query.trim() && !menuTree.getChildren().length ? t('No matching menu items.') : undefined;
  };
  context.subscriptions.push(menuTree, menuView,
    vscode.commands.registerCommand('rCommanderPlay.searchMenus', () => {
      const picker = vscode.window.createQuickPick();
      picker.title = t('Search R Commander menus');
      picker.placeholder = t('Type to filter menus; select an item to open it');
      picker.matchOnDescription = true;
      picker.matchOnDetail = true;
      picker.value = menuTree.query;
      picker.items = menuTree.searchItems();
      const listeners = [
        picker.onDidChangeValue(value => { filterMenus(value); picker.items = menuTree.searchItems(); }),
        picker.onDidAccept(() => {
          const chosen = picker.selectedItems[0];
          if (chosen) { picker.hide(); vscode.commands.executeCommand(chosen.command); }
        }),
        picker.onDidHide(() => { listeners.forEach(listener => listener.dispose()); picker.dispose(); })
      ];
      picker.show();
    }),
    vscode.commands.registerCommand('rCommanderPlay.clearMenuSearch', () => filterMenus('')),
    // A leaf of the sidebar tree: optionally close the menus first, as R Commander's
    // drop-down menus do, then open the command.
    vscode.commands.registerCommand('rCommanderPlay.chooseMenuItem', id => {
      if (configuration().get('closeMenusAfterChoice', false)) menuTree.closeMenus();
      return vscode.commands.executeCommand(`rcp.cmd.${id}`);
    }),
    vscode.commands.registerCommand('rCommanderPlay.toggleCloseMenus', async () => {
      const enabled = !configuration().get('closeMenusAfterChoice', false);
      await configuration().update('closeMenusAfterChoice', enabled, vscode.ConfigurationTarget.Global);
      if (enabled) menuTree.closeMenus();
      await vscode.window.showInformationMessage(enabled
        ? t('The menus will close after choosing an option.') : t('The menus will stay open after choosing an option.'));
    }));

  // VS Code puts the hover of the provider registered last on top, and the R language
  // server registers its own after it starts. So register ours again once it is up, and
  // whenever an R file is activated, to keep "where is it in the R Commander menu" first.
  let hoverRegistration;
  const registerHover = () => {
    hoverRegistration?.dispose?.();
    hoverRegistration = vscode.languages.registerHoverProvider({ language: 'r' }, new MenuHover(vscode));
  };
  registerHover();
  const timers = [6000, 15000].map(ms => { const timer = setTimeout(registerHover, ms); timer.unref?.(); return timer; });
  context.subscriptions.push(
    { dispose: () => { timers.forEach(clearTimeout); hoverRegistration?.dispose?.(); } },
    vscode.window.onDidChangeActiveTextEditor(editor => { if (editor?.document.languageId === 'r') registerHover(); }));

  context.subscriptions.push(status, vscode.window.onDidChangeActiveTextEditor(show),
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('rCommanderPlay.language')) { applyLanguage(); show(); menuTree.refresh(); }
    }),
    vscode.commands.registerCommand('rCommanderPlay.setLanguage', async () => {
      const picked = await vscode.window.showQuickPick([{ label: 'English', value: 'en' }, { label: 'Español', value: 'es' }],
        { title: 'R Commander: language / idioma', placeHolder: 'English / Español' });
      if (!picked) return;
      await configuration().update('language', picked.value, vscode.ConfigurationTarget.Global);
      try {
        // The manifest strings (menu labels) are read from package.nls.json at start-up.
        fs.copyFileSync(path.join(context.extensionPath, 'i18n', `nls.${picked.value}.json`), path.join(context.extensionPath, 'package.nls.json'));
        const reload = picked.value === 'es' ? 'Recargar ventana' : 'Reload Window';
        if (await vscode.window.showInformationMessage(picked.value === 'es'
          ? 'Idioma cambiado. Recarga la ventana para actualizar las etiquetas de los menús.'
          : 'Language changed. Reload the window to update the menu labels.', reload)) {
          await vscode.commands.executeCommand('workbench.action.reloadWindow');
        }
      } catch (error) {
        await vscode.window.showWarningMessage(`${error.message || error}`);
      }
    }),
    ...Object.keys(commands).map(id => vscode.commands.registerCommand(`rcp.cmd.${id}`, async () => {
      try {
        await commander.execute(id);
      } catch (error) {
        await vscode.window.showErrorMessage(`R Commander: ${error.message || error}`);
      }
    })));
}

module.exports = { activate };

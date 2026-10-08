// File, Edit, Tools and Help menus: they act on files, the editor or the R session
// rather than on the active data set.
const { rs } = require('../lib/rhelpers');

const editor = command => ({ vscode: command });

module.exports = {
  Setwd: { ds: false, fields: [{ k: 'dir', type: 'dir', label: 'Select the working directory' }],
    code: v => `setwd(${rs(v.dir)})\ngetwd()` },
  loadLog: editor('workbench.action.files.openFile'),
  saveLog: editor('workbench.action.files.save'),
  saveLogAs: editor('workbench.action.files.saveAs'),
  loadRmd: editor('workbench.action.files.openFile'),
  saveRmd: editor('workbench.action.files.save'),
  saveRmdAs: editor('workbench.action.files.saveAs'),
  saveWorkspace: { ds: false, code: () => 'save.image()' },
  saveWorkspaceAs: { ds: false,
    fields: [{ k: 'file', type: 'file', mode: 'save', def: 'workspace.RData', label: 'Save the R workspace as', filters: { 'R workspace': ['RData', 'rda'] } }],
    code: v => `save.image(${rs(v.file)})` },
  closeCommanderAndR: { ds: false, code: () => 'quit(save = "ask")' },
  restartCommander: editor('r.createRTerm'),

  onCut: editor('editor.action.clipboardCutAction'),
  onCopy: editor('editor.action.clipboardCopyAction'),
  onPaste: editor('editor.action.clipboardPasteAction'),
  onDelete: editor('deleteLeft'),
  onFind: editor('actions.find'),
  onSelectAll: editor('editor.action.selectAll'),
  onUndo: editor('undo'),
  onRedo: editor('redo'),
  onClear: editor('rCommanderPlay.clearTerminal'),

  loadPackages: { ds: false,
    fields: [{ k: 'pkgs', type: 'installed', label: 'Packages to load (pick one or more)' }],
    code: v => v.pkgs.map(p => `library(${p.match(/^[A-Za-z][A-Za-z0-9.]*$/) ? p : '`' + p + '`'})`).join('\n') },
  loadPlugins: { ds: false,
    fields: [{ k: 'pkgs', type: 'installed', filter: '^RcmdrPlugin', label: 'Rcmdr plug-ins to load' }],
    code: v => v.pkgs.map(p => `library(${p})`).join('\n') },
  Options: { vscode: 'workbench.action.openSettings', args: ['rCommanderPlay'] },
  installPackages: { ds: false, extraIn: 'toolsMenu', label: { en: 'Install package(s)...', es: 'Instalar paquete(s)...' },
    fields: [{ k: 'pkgs', type: 'text', label: 'Package names separated by commas', def: 'car, RcmdrMisc' }],
    // A terminal R without a configured repository waits for a mirror to be chosen, which looks
    // like a stuck download: use cloud.r-project.org unless the user set a repository.
    code: v => ['local({', '  repos <- getOption("repos")', '  if (is.null(repos) || any(repos == "@CRAN@")) repos <- c(CRAN = "https://cloud.r-project.org")',
      '  options(timeout = max(600, getOption("timeout")))',
      `  install.packages(c(${v.pkgs.split(/[,\s]+/).filter(Boolean).map(rs).join(', ')}), repos = repos)`, '})'].join('\n') },

  helpCommander: { ds: false, code: () => 'help(package = "Rcmdr")' },
  browseManual: { ds: false, url: 'https://socialsciences.mcmaster.ca/jfox/Misc/Rcmdr/Getting-Started-with-the-Rcmdr.pdf' },
  browseEnglishManual: { ds: false, url: 'https://socialsciences.mcmaster.ca/jfox/Misc/Rcmdr/Getting-Started-with-the-Rcmdr.pdf' },
  browseRcmdrWebsite: { ds: false, url: 'https://www.rcommander.com' },
  helpAboutCommander: { ds: false, code: () => 'print(utils::packageDescription("Rcmdr")[c("Package", "Version", "Title", "Author", "Maintainer")])' },
  browseRcmdrHexSticker: { ds: false, code: () => 'browseURL(system.file("etc", "Rcmdr-hex.pdf", package = "Rcmdr"))' },
  startHelp: { ds: false, code: () => 'help.start()' },
  browseRWebsite: { ds: false, url: 'https://www.r-project.org' },
  browseRMarkdown: { ds: false, url: 'https://rmarkdown.rstudio.com' }
};

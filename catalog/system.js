// File, Edit, Tools and Help menus: they act on files, the editor or the R session
// rather than on the active data set.
const { rs } = require('../lib/rhelpers');

const editor = command => ({ vscode: command });
// The chosen CRAN mirror becomes the CRAN entry of R's repositories for the session (as the mirror
// chooser of R's own GUIs does), keeping any other repository the user already had.
const mirrorOf = value => [].concat(value || [])[0] || 'https://cloud.r-project.org';
const reposLine = mirror => `repos <- getOption("repos"); if (is.null(repos)) repos <- c(CRAN = ${rs(mirrorOf(mirror))}) else repos["CRAN"] <- ${rs(mirrorOf(mirror))}; options(repos = repos)`;
// The mirror list: the one in the settings first, then CRAN's cloud mirror, then every mirror R knows
// (downloaded from CRAN, or the copy that ships with R when offline), HTTPS ones first.
const mirrorField = {
  k: 'mirror', type: 'rlist', single: true, selectFirst: true, filterable: true, labelColumn: 2, label: 'CRAN mirror (pick one)',
  slow: 'Looking up the CRAN mirrors...', timeout: 60000,
  expr: c => `local({ old <- options(timeout = 15); on.exit(options(old)); ` +
    `m <- tryCatch(getCRANmirrors(local.only = FALSE), error = function(e) getCRANmirrors(local.only = TRUE)); ` +
    `if ("OK" %in% names(m)) m <- m[m$OK == 1, ]; m <- m[order(!grepl("^https", m$URL), m$Name), ]; ` +
    `c(paste0(${rs(c.cranMirror || 'https://cloud.r-project.org')}, "\t(current) ", ${rs(c.cranMirror || 'https://cloud.r-project.org')}), ` +
    `"https://cloud.r-project.org\t0-Cloud (automatic, recommended)", paste0(m$URL, "\t", m$Name, " [", sub(":.*", "", m$URL), "]")) })`
};
const saveMirror = (v, host) => {
  host.updateSetting?.('cranMirror', mirrorOf(v.mirror));
  if (v.flags?.keep && v.folder?.trim()) host.updateSetting?.('packageDownloads', v.folder.trim());
};
// Permanent downloads: R deletes its own download folder when the session ends, so the same package
// would be fetched again later. With "keep", tarballs go to a folder that is also an index (a tiny
// local repository) consulted before CRAN, so a package already downloaded is not downloaded again.
const keepField = { k: 'folder', type: 'text', def: c => c.packageDownloads, label: 'Download folder', when: v => v.flags.keep,
  pattern: /\S/, error: 'Enter a folder.' };
const keepFlag = ['keep', 'Keep the downloaded files in a permanent folder (reused next time; R deletes its own temporary one)', true];
const keepSetup = v => !v.flags.keep ? [] : [
  `  cache <- path.expand(${rs(v.folder.trim())}); contrib <- file.path(cache, "src", "contrib"); dir.create(contrib, recursive = TRUE, showWarnings = FALSE)`,
  '  if (file.exists(file.path(contrib, "PACKAGES"))) repos <- c(CACHE = paste0("file://", if (grepl("^[A-Za-z]:", cache)) "/", cache), repos)'];
const keepArg = v => (v.flags.keep ? ', destdir = contrib' : '');
const keepIndex = v => (v.flags.keep ? ['  try(tools::write_PACKAGES(contrib, type = "source"), silent = TRUE)'] : []);

module.exports = {
  Setwd: { ds: false, fields: [{ k: 'dir', type: 'dir', label: 'Select the working directory' }],
    code: v => `setwd(${rs(v.dir)})` },
  loadLog: editor('workbench.action.files.openFile'),
  saveLog: editor('workbench.action.files.save'),
  saveLogAs: editor('workbench.action.files.saveAs'),
  loadRmd: editor('workbench.action.files.openFile'),
  saveRmd: editor('workbench.action.files.save'),
  saveRmdAs: editor('workbench.action.files.saveAs'),
  // "Save output": what the commands printed is written to a text file (the last file is reused, as in Rcmdr).
  saveOutput: { ds: false, noForm: c => Boolean(c.outputFile),
    fields: [{ k: 'file', type: 'file', mode: 'save', def: 'RCommander.txt', label: 'Save the output as', filters: { 'Output files': ['txt'], 'All files': ['*'] } }],
    remember: (v, c, commander) => { commander.outputFile = c.outputFile || v.file; },
    code: (v, c) => `save_output(${rs(c.outputFile || v.file)})` },
  saveOutputAs: { ds: false,
    fields: [{ k: 'file', type: 'file', mode: 'save', def: 'RCommander.txt', label: 'Save the output as', filters: { 'Output files': ['txt'], 'All files': ['*'] } }],
    remember: (v, c, commander) => { commander.outputFile = v.file; },
    code: v => `save_output(${rs(v.file)})` },
  loadRnw: editor('workbench.action.files.openFile'),
  saveRnw: editor('workbench.action.files.save'),
  saveRnwAs: editor('workbench.action.files.saveAs'),
  // R Markdown and knitr documents that collect the commands (lib/report.js).
  editMarkdown: { ds: false, run: commander => commander.startDocument('rmd') },
  editKnitr: { ds: false, run: commander => commander.startDocument('rnw') },
  removeLastRmdBlock: { ds: false, run: commander => commander.removeFromDocument('rmd', 'block') },
  removeLastRmdSection: { ds: false, run: commander => commander.removeFromDocument('rmd', 'title') },
  removeLastRnwBlock: { ds: false, run: commander => commander.removeFromDocument('rnw', 'block') },
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
    fields: [{ k: 'pkgs', type: 'installed', label: 'Packages (pick one or more)' }],
    code: v => v.pkgs.map(p => `library(${p.match(/^[A-Za-z][A-Za-z0-9.]*$/) ? p : '`' + p + '`'})`).join('\n') },
  loadPlugins: { ds: false,
    fields: [{ k: 'pkgs', type: 'installed', filter: '^RcmdrPlugin', label: 'Plug-ins (pick one or more)' }],
    code: v => v.pkgs.map(p => `library("${p}", character.only=TRUE)`).join('\n') },
  Options: { vscode: 'workbench.action.openSettings', args: ['rCommanderPlay'] },
  // ---- R package installer (what RGui's "Packages" menu offers) ------------------------------
  // Only what is missing is downloaded. A terminal R without a configured repository waits for a
  // mirror to be chosen, which looks like a stuck download: use the mirror from the settings
  // (cloud.r-project.org by default) unless R already has a repository configured.
  installPackages: { ds: false, extraIn: 'toolsMenu', label: { en: 'Install package(s)...', es: 'Instalar paquete(s)...' },
    fields: [
      mirrorField,
      { k: 'pkgs', type: 'rlist', of: 'mirror', label: 'Packages on CRAN (pick one or more)', filterable: true, min: 0, slow: 'Fetching the package list from CRAN...', timeout: 120000,
        emptyMessage: 'Could not get the list of packages from CRAN (no connection?). You can still type package names.',
        exprFor: (mirror, c) => `local({ ${reposLine(mirror)}; ap <- available.packages(repos = repos); have <- installed.packages()[, "Version"]; pk <- sort(unique(rownames(ap))); ` +
          `paste0(pk, "\\t", ap[pk, "Version"], ifelse(pk %in% names(have), paste0("  (installed: ", have[match(pk, names(have))], ")"), "")) })` },
      { k: 'names', type: 'text', optional: true, def: '', label: 'Other package names (comma-separated)', sample: 'cli' },
      { k: 'flags', type: 'flags', label: 'Options', items: [['suggests', 'Also install suggested packages', false], ['force', 'Reinstall packages that are already installed', false], keepFlag] },
      keepField],
    check: v => (v.pkgs.length || v.names.trim() ? undefined : 'Pick or type at least one package.'),
    apply: saveMirror,
    code(v) {
      const wanted = [...new Set([...v.pkgs, ...v.names.split(/[,\s]+/).filter(Boolean)])];
      return ['local({', `  wanted <- c(${wanted.map(rs).join(', ')})`,
        v.flags.force ? '  todo <- wanted' : '  todo <- wanted[!nzchar(vapply(wanted, function(p) system.file(package = p), ""))]',
        '  if (length(todo) < length(wanted)) message("Already installed, not downloaded again: ", paste(setdiff(wanted, todo), collapse = ", "))',
        '  if (!length(todo)) return(invisible(NULL))', `  ${reposLine(v.mirror)}`, ...keepSetup(v), '  options(timeout = max(600, getOption("timeout")))',
        `  install.packages(todo, repos = repos${v.flags.suggests ? ', dependencies = TRUE' : ''}${keepArg(v)})`, ...keepIndex(v), '})'].join('\n');
    } },
  updatePackages: { ds: false, extraIn: 'toolsMenu', label: { en: 'Update packages...', es: 'Actualizar paquetes...' },
    fields: [
      mirrorField,
      { k: 'pkgs', type: 'rlist', of: 'mirror', label: 'Packages with a newer version (pick the ones to update)', filterable: true, selectAll: true,
        slow: 'Looking for updates on CRAN...', timeout: 120000, emptyMessage: 'All the packages are up to date.',
        exprFor: mirror => `local({ ${reposLine(mirror)}; old <- old.packages(repos = repos, checkBuilt = TRUE); ` +
          `if (is.null(old)) character() else paste0(rownames(old), "\\t", old[, "Installed"], " -> ", old[, "ReposVer"]) })` },
      { k: 'flags', type: 'flags', label: 'Options', items: [keepFlag] }, keepField],
    apply: saveMirror,
    code: v => ['local({', `  ${reposLine(v.mirror)}`, ...keepSetup(v), '  options(timeout = max(600, getOption("timeout")))',
      `  install.packages(c(${v.pkgs.map(rs).join(', ')}), repos = repos${keepArg(v)})`, ...keepIndex(v), '})'].join('\n') },
  installLocalPackages: { ds: false, extraIn: 'toolsMenu', label: { en: 'Install package(s) from local files...', es: 'Instalar paquete(s) desde archivos locales...' },
    fields: [{ k: 'file', type: 'file', mode: 'open', label: 'Select the package archive', filters: { 'Package archives': ['gz', 'tgz', 'zip'], 'All files': ['*'] } }],
    code: v => `install.packages(${rs(v.file)}, repos = NULL, type = ${/\.(zip|tgz)$/i.test(v.file) ? '"binary"' : '"source"'})` },
  setCranMirror: { ds: false, extraIn: 'toolsMenu', label: { en: 'Set CRAN mirror...', es: 'Elegir mirror de CRAN...' },
    fields: [mirrorField],
    apply: saveMirror,
    code: v => `options(repos = c(CRAN = ${rs(mirrorOf(v.mirror))}))\ngetOption("repos")` },
  listInstalledPackages: { ds: false, extraIn: 'toolsMenu', label: { en: 'Installed packages...', es: 'Paquetes instalados...' },
    code: () => 'View(as.data.frame(installed.packages()[, c("Package", "Version", "Priority", "LibPath")], row.names = FALSE), title = "Installed packages")' },
  interruptR: { vscode: 'rCommanderPlay.interruptR', extraIn: 'toolsMenu', label: { en: 'Interrupt R', es: 'Interrumpir R' } },

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

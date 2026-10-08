const fs = require('fs');
const os = require('os');
const path = require('path');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Raw R string literal that cannot be closed by anything inside the text.
function rawString(text) {
  let dashes = '-';
  while (text.includes(`)${dashes}"`)) dashes += '-';
  return `r"${dashes}(${text})${dashes}"`;
}

// Talks to the R terminal that REditorSupport.r manages. What runs is written to a small
// job file and the terminal only receives `source("<job file>")`, so the console shows
// one short line instead of the whole script as a giant string. The terminal cannot return
// values, so queries make R write a file that we poll for.
class RSession {
  constructor(vscode, runnerPath) {
    this.vscode = vscode;
    this.runnerPath = runnerPath;
    this.runner = JSON.stringify(runnerPath);
    this.counter = 0;
    this.removeStaleJobs();
  }

  removeStaleJobs() {
    try {
      for (const name of fs.readdirSync(os.tmpdir())) {
        const file = path.join(os.tmpdir(), name);
        if (/^rcp-\d+-\d+\.R$/.test(name) && Date.now() - fs.statSync(file).mtimeMs > 3600e3) fs.unlinkSync(file);
      }
    } catch { /* the temporary directory is not ours to worry about */ }
  }

  // Loads the runner once into the "R Play" entry of the search path (and again if the
  // extension was updated since), so its helpers never clutter the user's workspace.
  bootstrap() {
    let stamp = '0';
    try { stamp = String(fs.statSync(this.runnerPath).mtimeMs); } catch { /* use the default */ }
    return `local({ stamp <- ${JSON.stringify(stamp)}\n` +
      `  if (!"R Play" %in% search() || !identical(get0(".stamp", as.environment("R Play"), inherits = FALSE), stamp)) {\n` +
      `    if ("R Play" %in% search()) detach("R Play", character.only = TRUE)\n` +
      `    e <- attach(NULL, name = "R Play"); sys.source(${this.runner}, envir = e); assign(".stamp", stamp, envir = e) } })`;
  }

  // R snippet that loads the R Commander functions when the settings ask for it.
  attachCall(settings = {}, code = '') {
    if (settings.loadRcmdrFunctions === false) return '';
    const plugins = (settings.rcmdrPlugins || []).map(p => JSON.stringify(p));
    const names = JSON.stringify(path.join(path.dirname(this.runnerPath), 'data', 'rcmdr-names.txt'));
    // A failure to load them must never stop the user's code from running.
    return `tryCatch(attach_rcmdr_if_used(${rawString(code)}, ${names}${plugins.length ? `, c(${plugins.join(', ')})` : ''}), error = function(e) message("R Play: could not load the R Commander functions: ", conditionMessage(e)))`;
  }

  // Writes the job and returns the line to send to the terminal. The job removes itself.
  job(body) {
    const file = path.join(os.tmpdir(), `rcp-${process.pid}-${++this.counter}.R`);
    fs.writeFileSync(file, `${this.bootstrap()}\ntryCatch({\n${body}\n}, finally = unlink(${JSON.stringify(file)}))\n`, 'utf8');
    return `source(${JSON.stringify(file)}, encoding = "UTF-8")`;
  }

  // Runs code in the R terminal through the runner (echo, previews, package checks).
  async run(code, { require: packages = [], settings = {} } = {}) {
    const pkgs = packages.length ? `c(${packages.map(p => JSON.stringify(p)).join(', ')})` : 'character()';
    const skipped = (settings.skipCommands || []).length ? `c(${settings.skipCommands.map(c => JSON.stringify(c)).join(', ')})` : 'character()';
    const attach = this.attachCall(settings, code);
    const max = Number.isInteger(settings.maxOutputItems) ? settings.maxOutputItems : 24;
    const body = `${attach}${attach ? '\n' : ''}run_code(${rawString(code)}, skip_help = ${settings.skipHelp ? 'TRUE' : 'FALSE'}, skip_commands = ${skipped}, ` +
      `limit_output = ${settings.limitOutput ? 'TRUE' : 'FALSE'}, max_output_items = ${max}, require = ${pkgs})`;
    await this.vscode.commands.executeCommand('r.runCommand', this.job(body));
  }

  // The text sent to the R terminal to answer a query into `file`.
  queryCommand(expression, file) {
    return this.job(`write_query(${JSON.stringify(file)}, ${JSON.stringify(expression)})`);
  }

  // Evaluates an R expression and returns its elements as strings, or undefined
  // if R did not answer in time (busy, not started, or the extension is missing).
  async query(expression, timeout = 15000) {
    const file = path.join(os.tmpdir(), `rcp-${process.pid}-${++this.counter}.txt`);
    try { fs.unlinkSync(file); } catch { /* not there yet */ }
    const command = this.queryCommand(expression, file);
    await this.vscode.commands.executeCommand('r.runCommand', command);
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (fs.existsSync(file)) {
        const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
        if (lines.length && lines[lines.length - 1] === '') lines.pop();
        try { fs.unlinkSync(file); } catch { /* ignore */ }
        return lines;
      }
      await delay(40);
    }
    return undefined;
  }

  // The state the dialogs need: data frames with their variables, models, objects.
  async snapshot() {
    const lines = await this.query('session_info()');
    if (!lines) return undefined;
    const state = { datasets: {}, models: [], hclusts: [], objects: [] };
    for (const line of lines) {
      const [type, a, b, c, d, e] = line.split('\t');
      if (type === 'O') state.objects.push(a);
      else if (type === 'D') state.datasets[a] = { name: a, rows: Number(b), columns: Number(c), vars: [] };
      else if (type === 'V' && state.datasets[a]) {
        state.datasets[a].vars.push({ name: b, kind: c, levels: Number(d), discrete: e === '1' });
      } else if (type === 'M') state.models.push({ name: a, cls: b });
      else if (type === 'H') state.hclusts.push(a);
    }
    return state;
  }
}

module.exports = { RSession };

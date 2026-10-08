const fs = require('fs');
const os = require('os');
const path = require('path');

// R snippet that loads the R Commander functions when the settings ask for it.
function attachCall(settings = {}) {
  if (settings.loadRcmdrFunctions === false) return '';
  const plugins = (settings.rcmdrPlugins || []).map(p => JSON.stringify(p));
  // A failure to load them must never stop the user's code from running.
  return `tryCatch(attach_rcmdr(${plugins.length ? `c(${plugins.join(', ')})` : ''}), error = function(e) message("R Play: could not load the R Commander functions: ", conditionMessage(e))); `;
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Talks to the R terminal that REditorSupport.r manages. The terminal cannot
// return values, so queries make R write a file that we poll for.
class RSession {
  constructor(vscode, runnerPath) {
    this.vscode = vscode;
    this.runner = JSON.stringify(runnerPath);
    this.counter = 0;
  }

  // Runs code in the R terminal through the runner (echo, previews, package checks).
  async run(code, { require: packages = [], settings = {} } = {}) {
    const pkgs = packages.length ? `c(${packages.map(p => JSON.stringify(p)).join(', ')})` : 'character()';
    const command = `local({ sys.source(${this.runner}, envir = environment()); ${attachCall(settings)}run_code(${JSON.stringify(code)}, ` +
      `skip_help = FALSE, skip_commands = character(), limit_output = ${settings.limitOutput ? 'TRUE' : 'FALSE'}, ` +
      `max_output_items = ${settings.maxOutputItems || 24}, require = ${pkgs}) })`;
    await this.vscode.commands.executeCommand('r.runCommand', command);
  }

  // The text sent to the R terminal to answer a query into `file`.
  queryCommand(expression, file) {
    return `invisible(local({ sys.source(${this.runner}, envir = environment()); ` +
      `write_query(${JSON.stringify(file)}, ${JSON.stringify(expression)}) }))`;
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

module.exports = { RSession, attachCall };

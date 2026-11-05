// Renders one R Commander form (the real webview HTML) as a standalone page with Tokyo Night colors, to screenshot it
// without a VS Code window:
//   node build/render-form.js boxPlot "Diagrama de cajas" /tmp/form.html iris
//   chromium --headless=new --no-sandbox --force-device-scale-factor=2 --window-size=900,650 \
//     --virtual-time-budget=3000 --screenshot=docs/screenshots/dialog.png file:///tmp/form.html
const fs = require('fs');
const path = require('path');
const repo = path.join(__dirname, '..');
const { FormDialog } = require(`${repo}/lib/form`);
const { context } = require(`${repo}/lib/rhelpers`);
const catalog = require(`${repo}/catalog`);
const { t, setLanguage } = require(`${repo}/lib/i18n`);
setLanguage('es');

const [id, title, out, withData] = process.argv.slice(2);
const num = names => names.map(name => ({ name, kind: 'numeric', levels: 0, discrete: false }));
const iris = { name: 'iris', rows: 150, columns: 5, vars: [...num(['Sepal.Length', 'Sepal.Width', 'Petal.Length', 'Petal.Width']), { name: 'Species', kind: 'factor', levels: 3, discrete: false }] };
(async () => {
  let html = '';
  let receive;
  const sent = [];
  const panel = {
    webview: { set html(v) { html = v; }, postMessage: m => sent.push(m), onDidReceiveMessage: cb => { receive = cb; } },
    onDidDispose: () => {}, dispose: () => {}
  };
  const vscode = { ViewColumn: { Active: 1 }, window: { createWebviewPanel: () => panel } };
  const ctx = context(withData ? 'iris' : '', { objects: [] });
  const state = { datasets: withData ? { iris } : {}, models: [], hclusts: [], objects: [] };
  const env = { vscode, t, state, vars: withData ? iris.vars : [], ctx, extra: {}, subtitle: withData ? 'Conjunto de datos: iris' : '',
    dataset: withData ? 'iris' : '', datasets: withData ? [{ name: 'iris', description: '150 × 5' }] : [] };
  const spec = catalog[id];
  new FormDialog(env).run(spec, title, { ctx, query: async () => [] }, async () => {});
  await receive({ type: 'ready' });
  const init = sent.find(m => m.type === 'init');

  const theme = `:root{--vscode-font-family:"Inter","Segoe UI",system-ui,sans-serif;--vscode-font-size:14px;
    --vscode-foreground:#a9b1d6;--vscode-descriptionForeground:#787c99;--vscode-editor-background:#1a1b26;
    --vscode-input-background:#14141b;--vscode-input-foreground:#a9b1d6;--vscode-input-border:#2a2c3d;
    --vscode-button-background:#3d59a1;--vscode-button-foreground:#ffffff;--vscode-button-secondaryBackground:#3b3e52;
    --vscode-button-secondaryForeground:#c0caf5;--vscode-button-border:transparent;--vscode-panel-border:#2a2c3d;
    --vscode-list-activeSelectionBackground:#2f3549;--vscode-list-activeSelectionForeground:#c0caf5;
    --vscode-errorForeground:#f7768e;--vscode-textLink-foreground:#7aa2f7;--vscode-inputValidation-errorBorder:#963c47}
    html,body{background:#1a1b26}`;
  const stub = `<script>
    window.acquireVsCodeApi = () => ({ postMessage: m => { if (m.type === 'ready') setTimeout(() => window.dispatchEvent(new MessageEvent('message', { data: ${JSON.stringify(init)} })), 0); }, getState: () => undefined, setState: () => {} });
  </script>`;
  // the real page, with the theme before its own styles and the stub before its script
  html = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/i, '');
  html = html.replace('<head>', `<head><style>${theme}</style>${stub}`);
  fs.writeFileSync(out, html);
})();

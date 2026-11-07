#!/usr/bin/env node
/** Real Chrome interaction smoke for the installed Workbench widgets (no fixture API). */
import { createServer } from 'node:http';
import { readFileSync, mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browser = [
  process.env.CHROME_BIN,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find(candidate => candidate && existsSync(candidate));
if (!browser) {
  console.error('WIDGET_BROWSER_SMOKE_UNAVAILABLE: Chrome/Chromium not installed');
  process.exit(2);
}
const dir = mkdtempSync(path.join(tmpdir(), 'agentsam-widget-chrome-'));
const entry = [
  "import React from 'react';",
  "import { createRoot } from 'react-dom/client';",
  "import { ClockWidget, CalculatorWidget } from './packages/agentsam-workbench/dist/widgets/index.js';",
  "const root = document.getElementById('mount');",
  "createRoot(root).render(React.createElement('main', {}, React.createElement(ClockWidget), React.createElement(CalculatorWidget)));",
  "const settle = () => new Promise(resolve => setTimeout(resolve, 125));",
  "const button = name => document.querySelector('.agentsam-calculator button[aria-label=\"' + name + '\"]');",
  "async function verify() {",
  "  await new Promise(resolve => setTimeout(resolve, 1100));",
  "  const clock = document.querySelector('.agentsam-clock__time');",
  "  if (!clock || clock.textContent.includes('--')) throw Error('real_clock_missing');",
  "  const zone = document.querySelector('select[aria-label=\"Clock timezone\"]');",
  "  if (!zone || zone.options.length < 5) throw Error('timezone_controls_missing');",
  "  zone.value = 'UTC'; zone.dispatchEvent(new Event('change', {bubbles:true}));",
  "  await settle();",
  "  if (zone.value !== 'UTC') throw Error('timezone_change_failed');",
  "  const format = document.querySelector('button[aria-label=\\\"Switch between 12 and 24 hour format\\\"]');",
  "  if (!format) throw Error('clock_format_toggle_missing'); format.click(); await settle();",
  "  if (format.getAttribute('aria-pressed') !== 'true') throw Error('clock_format_toggle_failed');",
  "  for (const key of ['7', '×', '8', '=']) {",
  "    const control = button(key); if (!control) throw Error('missing_key_'+key);",
  "    control.click(); await settle();",
  "  }",
  "  const output = document.querySelector('.agentsam-calculator__result');",
  "  if (!output || !output.textContent.includes('56')) throw Error('calculator_result_failed');",
  "  const history = [...document.querySelectorAll('.agentsam-calculator button')].find(b => b.textContent.trim() === 'History');",
  "  if (!history) throw Error('history_toggle_missing'); history.click(); await settle();",
  "  if (!document.querySelector('.agentsam-calculator__history')?.textContent.includes('56')) throw Error('history_not_recorded');",
  "  document.getElementById('smoke-result').textContent = 'WIDGET_BROWSER_INTERACTIONS_PASS';",
  "}",
  "verify().catch(err => {document.getElementById('smoke-result').textContent = 'WIDGET_BROWSER_FAIL:'+err.message+'::'+document.getElementById('mount').textContent.slice(0,300);});",
].join('\n');
await build({
  stdin: { contents: entry, resolveDir: root, sourcefile: 'widget-smoke-entry.tsx', loader: 'tsx' },
  outfile: path.join(dir, 'bundle.js'),
  bundle: true, platform: 'browser', format: 'iife', target: 'es2022',
  alias: {
    react: path.join(root, 'node_modules/react'),
    'react-dom': path.join(root, 'node_modules/react-dom'),
  },
  logLevel: 'silent',
});
const css = readFileSync(path.join(root, 'packages/agentsam-workbench/dist/widgets/widgets.css'), 'utf8');
writeFileSync(path.join(dir, 'style.css'), css);
const html = '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/style.css"></head><body><div id="mount"></div><p id="smoke-result">PENDING</p><script src="/bundle.js"></script></body></html>';
const server = createServer((req, res) => {
  const file = req.url === '/bundle.js' ? path.join(dir, 'bundle.js') : req.url === '/style.css' ? path.join(dir, 'style.css') : null;
  res.setHeader('Content-Type', file ? (file.endsWith('.css') ? 'text/css' : 'text/javascript') : 'text/html');
  res.end(file ? readFileSync(file) : html);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const args = [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-background-networking', '--disable-component-update', '--disable-sync',
  '--no-sandbox', '--virtual-time-budget=8000', '--dump-dom',
  '--user-data-dir=' + path.join(dir, 'profile'),
  'http://127.0.0.1:' + port + '/',
];
const child = spawn(browser, args, { stdio: ['ignore', 'pipe', 'pipe'] });
let output = '';
let stderr = '';
child.stdout.on('data', buffer => output += buffer);
child.stderr.on('data', buffer => stderr += buffer);
const timeout = setTimeout(() => child.kill('SIGTERM'), 18000);
const status = await new Promise(resolve => child.once('exit', resolve));
clearTimeout(timeout);
server.close();
rmSync(dir, { recursive: true, force: true });
if (status !== 0 || !output.includes('WIDGET_BROWSER_INTERACTIONS_PASS')) {
  console.error('WIDGET_BROWSER_SMOKE_FAILED', status);
  console.error(output.match(/WIDGET_BROWSER_FAIL:[^<]+/)?.[0] || output.slice(-1500));
  console.error('BROWSER_STDERR', stderr.slice(-3500));
  process.exit(1);
}
console.log('WIDGET_BROWSER_INTERACTIONS_PASS');

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('AgentSam hosted breadcrumbs stay beside the hamburger instead of drifting into it', () => {
  const css = read('../frontend/agentsam/shell.css');
  assert.match(css, /#agentsam-console-leading-slot:not\(:empty\)[^}]+--agentsam-leading-clearance/s);
  assert.match(css, /--agentsam-leading-clearance:\s*50px/);
  assert.match(css, /#agentsam-console-leading-slot:not\(:empty\)[^}]*margin-right:auto/s);
  assert.match(css, /justify-content:flex-start/);
});

test('Side Stage shrinks Home at desktop and tablet widths before using a phone overlay', () => {
  const css = read('../frontend/agentsam/platform-console.css');
  const shell = read('../frontend/agentsam/AgentSamShell.tsx');
  assert.match(css, /\.platform-console-stage\s*>\s*\.agentsam-route\s*\{[^}]*flex:\s*1\s+1\s+0%/s);
  assert.match(css, /\.agentsam-route\s*>\s*iframe\s*\{[^}]*width:\s*100%/s);
  assert.match(css, /@media\s*\(max-width:\s*760px\)[\s\S]*\.platform-console-assistant\s*\{\s*position:\s*absolute/);
  assert.match(shell, /<iframe title="AgentSam admin home" src="\/ecommerce-cms-agentsam\/admin\/home\.html\?__agentsamEmbedded=1"/);
});

test('Local Studio marks hosted Ecommerce routes so the packaged app does not mount a second global shell', () => {
  const host = read('../frontend/src/routes/(apps)/admin/apps/ecommerce-cms-agentsam.tsx');
  assert.match(host, /resolved\.searchParams\.set\('__agentsamEmbedded',\s*'1'\)/);
  assert.match(host, /data-agentsam-installed-app="ecommerce-cms-agentsam"/);
});

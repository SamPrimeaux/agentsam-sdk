import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createFixtureWorkHost, populatedWorkFixture } from '../dist/fixtures/index.js';
import { WORK_THEME_CSS_VARS } from '../dist/contracts/index.js';

test('fixture host implements the portable WorkHost snapshot contract', async () => {
  const host = createFixtureWorkHost();
  const snapshot = await host.snapshot();
  assert.equal(snapshot.currentProjectId, populatedWorkFixture.currentProjectId);
  assert.ok(snapshot.projects.length > 0);
});

test('work theme contract exposes stable CSS variable authority', () => {
  assert.equal(WORK_THEME_CSS_VARS.canvas, '--agentsam-work-canvas');
  assert.equal(WORK_THEME_CSS_VARS.accent, '--agentsam-work-accent');
});


test('embedded WorkShell delegates chrome to the host application', () => {
  const built = readFileSync(new URL('../dist/frontend/index.js', import.meta.url), 'utf8');
  assert.match(built, /presentation/);
  assert.match(built, /embedded/);
  assert.match(built, /data-presentation/);
});


test('Projects surface preserves the established Work product grammar', () => {
  const source = readFileSync(
    new URL('../src/frontend/surfaces/ProjectsSurface.tsx', import.meta.url),
    'utf8',
  );
  for (const label of ['My Projects', 'Recent', 'Shared', 'Archived', 'Starred']) {
    assert.match(source, new RegExp(label));
  }
  assert.match(source, /Search projects/);
  assert.match(source, /Create project is not available on hosted yet/);
  assert.match(source, /More actions for/);
  assert.match(source, /project\.coverImageUrl/);
});

test('Project detail preserves the established Work detail surface', () => {
  const source = readFileSync(
    new URL('../src/frontend/surfaces/ProjectDetailSurface.tsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /Tracked today/);
  assert.match(source, /Open tasks/);
  assert.match(source, /Repository linked and ready for indexing/);
  assert.match(source, /agentsam-work-toolbar-button/);
});


test('Tickets keeps its canonical route and host typography/contrast', () => {
  const shell = readFileSync(new URL('../src/frontend/WorkShell.tsx', import.meta.url), 'utf8');
  const tickets = readFileSync(new URL('../src/frontend/surfaces/TicketsSurface.tsx', import.meta.url), 'utf8');
  assert.ok(shell.includes('href: "/tickets"'));
  assert.ok(!shell.includes('/collaborate?seg=tickets'));
  assert.ok(tickets.includes('fontFamily: "inherit"'));
  assert.ok(tickets.includes('color: "var(--agentsam-work-text)"'));
});

test('Work snapshots render immediately and refresh by surface', () => {
  const source = readFileSync(new URL('../src/frontend/WorkProduct.tsx', import.meta.url), 'utf8');
  assert.ok(!source.includes('Loading Work…'));
  assert.ok(source.includes('SNAPSHOT_CACHE'));
  assert.ok(source.includes('host.snapshot({ surface })'));
});

test('Mail exposes provider-neutral connections and real message actions', () => {
  const source = readFileSync(new URL('../src/frontend/surfaces/MailSurface.tsx', import.meta.url), 'utf8');
  assert.match(source, /Mail connections/);
  assert.match(source, /mailboxConnections/);
  assert.match(source, /infrastructureConnections/);
  assert.match(source, /Mail infrastructure/);
  assert.match(source, /item\.capabilities/);
  assert.match(source, /onSelectConnection/);
  assert.match(source, /onConnectProvider/);
  assert.match(source, /onArchive/);
  assert.match(source, /onStar/);
  assert.match(source, /onSend/);
  assert.match(source, /Sending…/);
});

test('Work mini navigation is host-controlled and collapsible', () => {
  const shell = readFileSync(new URL('../src/frontend/WorkShell.tsx', import.meta.url), 'utf8');
  const theme = readFileSync(new URL('../src/frontend/theme.css', import.meta.url), 'utf8');
  assert.match(shell, /navCollapsed/);
  assert.match(shell, /onNavCollapsedChange/);
  assert.match(shell, /Collapse Work navigation/);
  assert.match(theme, /data-nav-collapsed="true"/);
  assert.match(theme, /grid-template-columns: 64px minmax\(0, 1fr\)/);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
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


test('Projects surface keeps the established Work grammar and now supports full CRUD', () => {
  const source = readFileSync(new URL('../src/frontend/surfaces/ProjectsSurface.tsx', import.meta.url), 'utf8');
  for (const label of ['All', 'Active', 'Production', 'Starred', 'Archived']) {
    assert.match(source, new RegExp(label));
  }
  assert.match(source, /Search projects/);
  assert.match(source, /\+ New project/);
  assert.match(source, /More actions for/);
  assert.match(source, /Current objective/);
  assert.doesNotMatch(source, /not available on hosted yet/);
});

test('every Work surface hides controls the host cannot perform (capability gated)', () => {
  const read = (name) => readFileSync(new URL(`../src/frontend/${name}`, import.meta.url), 'utf8');
  assert.match(read('surfaces/TicketsSurface.tsx'), /caps\.create/);
  assert.match(read('surfaces/ProjectsSurface.tsx'), /caps\.delete/);
  assert.match(read('surfaces/CalendarSurface.tsx'), /caps\.update/);
});

test('theme: no literal colors in Work UI source; hex only in the standalone defaults block', () => {
  const COLOR = /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/;
  const dir = new URL('../src/frontend/', import.meta.url);
  const files = [];
  const walk = (url) => {
    for (const entry of readdirSync(url, { withFileTypes: true })) {
      const child = new URL(entry.name + (entry.isDirectory() ? '/' : ''), url);
      if (entry.isDirectory()) walk(child);
      else if (/\.(tsx|ts)$/.test(entry.name) && entry.name !== 'theme.ts') files.push(child);
    }
  };
  walk(dir);
  for (const file of files) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), COLOR, `literal color in ${file.pathname.split('/src/')[1]}`);
  }
  const css = readFileSync(new URL('../src/frontend/theme.css', import.meta.url), 'utf8');
  const afterDefaults = css.slice(css.indexOf('.agentsam-work {'));
  assert.doesNotMatch(afterDefaults, COLOR, 'theme.css has literal colors outside the :root defaults block');
});


test('mobile work flow exposes real Quick Create actions while preserving five-item navigation', () => {
  const read = (name) => readFileSync(new URL('../src/frontend/' + name, import.meta.url), 'utf8');
  const shell = read('WorkShell.tsx');
  const product = read('WorkProduct.tsx');
  const theme = read('theme.css');
  assert.match(shell, /onQuickCreate/);
  assert.match(shell, /aw-mobile-create/);
  for (const action of ['createTicket', 'createProject', 'createEvent']) assert.match(product, new RegExp(action));
  for (const editor of ['ProjectEditor', 'TicketEditor', 'EventEditor']) assert.match(product, new RegExp(editor));
  assert.match(theme, /safe-area-inset-bottom/);
  assert.match(theme, /min-height: 44px/);
  assert.match(theme, /aw-quick-create-sheet/);
  for (const nav of ['calendar', 'tickets', 'mail', 'projects', 'artifacts']) assert.match(shell, new RegExp('id: "' + nav + '" as const'));
});

test('desktop WorkHost uses identical CRUD routes as browser and Rust permits every write', () => {
  const localStudio = readFileSync(new URL('../../../apps/local-studio/frontend/src/components/work/LocalStudioWorkPage.tsx', import.meta.url), 'utf8');
  const bridge = readFileSync(new URL('../../agentsam-desktop-shell/src-tauri/src/commands/local_identity.rs', import.meta.url), 'utf8');
  const client = readFileSync(new URL('../src/client/index.ts', import.meta.url), 'utf8');
  assert.match(localStudio, /createWorkCrud\(request\)/);
  assert.match(localStudio, /snapshotRequest.from/);
  assert.match(localStudio, /snapshotRequest.to/);
  for (const prefix of ['/api/projects', '/api/calendar/events', '/api/tickets']) {
    assert.ok(client.includes(prefix), 'browser missing route ' + prefix);
    assert.ok(bridge.includes(prefix), 'desktop missing route ' + prefix);
  }
  for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) assert.match(bridge, new RegExp('"'+ method + '" => Method::' + method));
});

test('project portfolio maps real ticket records into a selectable timeline, never fake milestones', () => {
  const read = (name) => readFileSync(new URL('../src/frontend/' + name, import.meta.url), 'utf8');
  const portfolio = read('ProjectPortfolio.tsx');
  const plan = read('ticket-plan.ts');
  const timeline = read('TimelineView.tsx');
  const detail = read('surfaces/ProjectDetailSurface.tsx');
  assert.match(portfolio, /sameProject/);
  assert.match(portfolio, /onOpenTicket/);
  assert.match(portfolio, /timelineItems/);
  assert.match(plan, /provenance: "scheduled"/);
  assert.match(plan, /provenance: "activity"/);
  assert.match(timeline, /Observed changes, not planned dates/);
  assert.match(timeline, /Only user-scheduled dates/);
  assert.match(detail, /hideModeTabs/);
  assert.match(detail, /not verification evidence/);
});

test('ticket queue uses compact actionable recommendations and supports collapsing filters', () => {
  const file = readFileSync(new URL('../src/frontend/surfaces/TicketsSurface.tsx', import.meta.url), 'utf8');
  assert.match(file, /aw-focus-item/);
  assert.match(file, /aw-ticket-search/);
  assert.match(file, /aria-expanded=\{showFilters\}/);
  assert.doesNotMatch(file, /plan\.batch\.slice\(0, 4\)\.map/);
});


test('Work project conversations are assigned Local Studio chats, not IAM records', () => {
  const read = (name) => readFileSync(new URL('../src/' + name, import.meta.url), 'utf8');
  const detail = read('frontend/surfaces/ProjectDetailSurface.tsx');
  const panel = read('frontend/ProjectChatsPanel.tsx');
  const contracts = read('contracts/index.ts');
  assert.match(detail, /ProjectChatsPanel/);
  assert.match(detail, /chatHost=|host=\{chatHost/);
  assert.match(panel, /Assign an existing conversation/);
  assert.match(panel, /New chat/);
  assert.match(panel, /\/chats\//);
  assert.doesNotMatch(panel, /\/trails|IAM session|\/api\/agent\/sessions/);
  assert.match(contracts, /listProjectChats/);
  assert.match(contracts, /assignProjectChat/);
  assert.match(contracts, /createProjectChat/);
});

test('project overview starts a conversation in its linked chat and keeps Work center-stage', () => {
  const detail = readFileSync(new URL('../src/frontend/surfaces/ProjectDetailSurface.tsx', import.meta.url), 'utf8');
  const projects = readFileSync(new URL('../src/frontend/surfaces/ProjectsSurface.tsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/frontend/theme.css', import.meta.url), 'utf8');
  const adapter = readFileSync(new URL('../../../apps/local-studio/frontend/src/lib/project-chat-links.ts', import.meta.url), 'utf8');
  const workspace = readFileSync(new URL('../../../apps/local-studio/frontend/src/components/shell/chat-workspace.tsx', import.meta.url), 'utf8');
  assert.match(detail, /className="aw-project-composer"/);
  assert.match(detail, /createProjectChat\(project\.id, message \|\| undefined\)/);
  assert.match(detail, /aw-project-detail__details/);
  assert.match(projects, /aw-projects-page/);
  assert.match(css, /\.agentsam-work \.aw-projects-page \{ width: 100%; max-width: 1040px;/);
  assert.match(css, /\.aw-project-detail__layout \{ display: flex; flex-direction: column;/);
  assert.match(css, /\.aw-work-content-layout\[data-ticket-open="true"\] \.aw-work-content-primary \{ display: none; \}/);
  assert.match(adapter, /if \(message\) void store\.send\(id, "chat", message, \{ projectId \}\)/);
  assert.match(workspace, /Math\.min\(560, window\.innerWidth \* 0\.36\)/);
});

test('Work delegates installed project apps to the host instead of defining a second project registry', () => {
  const contracts = readFileSync(new URL('../src/contracts/index.ts', import.meta.url), 'utf8');
  const detail = readFileSync(new URL('../src/frontend/surfaces/ProjectDetailSurface.tsx', import.meta.url), 'utf8');
  const localStudio = readFileSync(new URL('../../../apps/local-studio/frontend/src/components/work/LocalStudioWorkPage.tsx', import.meta.url), 'utf8');
  assert.match(contracts, /projectApps\?\(project: WorkProject\)/);
  assert.match(detail, /chatHost\?\.projectApps\?\.\(project\)/);
  assert.match(detail, /onNavigate\(app.href\)/);
  assert.match(localStudio, /projectApps: studioProjectApps/);
  assert.match(localStudio, /\/admin\/cad\?project=/);
  assert.doesNotMatch(detail, /\/admin\/cad/);
});

test("Project Gallery uses explicit project-linked media and Work Artifacts source views",()=>{
  const detail=readFileSync(new URL('../src/frontend/surfaces/ProjectDetailSurface.tsx',import.meta.url),'utf8');
  const artifacts=readFileSync(new URL('../src/frontend/surfaces/ArtifactsSurface.tsx',import.meta.url),'utf8');
  assert.match(detail,/a\.projectId === project\.id/);
  assert.match(detail,/tab === "gallery"/);
  assert.match(artifacts,/initialSource/);
  assert.match(artifacts,/view === "trash"/);
  assert.match(artifacts,/onOpenArtifact/);
});

test('Artifacts is a global Side Stage library with six focused creation routes and responsive menus', () => {
  const surface = readFileSync(new URL('../src/frontend/surfaces/ArtifactsSurface.tsx', import.meta.url), 'utf8');
  const stage = readFileSync(new URL('../../../apps/local-studio/frontend/src/components/workbench/artifacts.tsx', import.meta.url), 'utf8');
  const launcher = readFileSync(new URL('../../../apps/local-studio/frontend/src/lib/work/artifact-launcher.ts', import.meta.url), 'utf8');
  const mapper = readFileSync(new URL('../../../apps/local-studio/backend/worker/work-library-resources.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/frontend/theme.css', import.meta.url), 'utf8');
  for (const label of ['All', 'Yours', 'Shared', 'Docs', 'Slides', 'Sheets', 'Design', 'Data', 'Whiteboard']) {
    assert.match(surface, new RegExp('label: "' + label + '"'));
  }
  assert.match(surface, /aria-label="Search artifacts"/);
  assert.match(surface, /aria-label="Filter artifacts"/);
  assert.match(surface, /aria-label="Filter by view"/);
  assert.match(surface, /sorted\.slice\(0, 50\)/);
  assert.match(surface, /view === "starred"/);
  assert.match(surface, /view === "recent"/);
  assert.match(surface, /aria-label="Sort artifacts"/);
  assert.match(surface, /aria-label="Create artifact"/);
  assert.match(surface, /openInWorkspace/);
  assert.match(stage, /sharedLiveWorkHost\(\)/);
  assert.match(stage, /surface: "artifacts"/);
  assert.doesNotMatch(stage, /NewTabStage|if \(!project\)/);
  assert.match(stage, /artifactType === "design-canvas"/);
  assert.match(launcher, /CREATION_PROMPTS/);
  assert.match(launcher, /openSideTab\("design"/);
  assert.match(launcher, /setDraft\(chatId/);
  assert.match(mapper, /row\.artifact_type === 'design-canvas'/);
  assert.match(css, /@media\(max-width:900px\)/);
  assert.match(css, /@media\(max-width:560px\)/);
});

test('Work project timer uses the same transport in hosted and desktop Work', async () => {
  const { createWorkCrud } = await import('../dist/client/index.js');
  const calls=[];
  const crud=createWorkCrud(async (path,method,body)=>{
    calls.push({path,method,body});
    return new Response(JSON.stringify({measurements:{projectId:'p1'},metricsPersisted:true}),{
      status:200,headers:{'content-type':'application/json'}
    });
  });
  const result=await crud.projectTimer('p1','start');
  assert.equal(result.metricsPersisted,true);
  await crud.projectTimer('p1','stop','te_a');
  assert.deepEqual(calls,[
    {path:'/api/work/projects/p1/timer/start',method:'POST',body:{}},
    {path:'/api/work/projects/p1/timer/stop',method:'POST',body:{timerId:'te_a'}},
  ]);
});

import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Bell,
  Bot,
  CalendarDays,
  CircleDot,
  FolderKanban,
  Goal,
  Layers3,
  MessageSquareText,
  Moon,
  Search,
  Sparkles,
  Sun,
  Tags,
  TicketCheck,
} from 'lucide-react';
import { Nav } from '@inneranimalmedia/agentsam-nav';
import '@inneranimalmedia/agentsam-nav/theme.css';
import { ProjectsSurface } from '@inneranimalmedia/agentsam-workbench/projects';
import { GanttBoard } from '@inneranimalmedia/agentsam-workbench/timeline';
import '@inneranimalmedia/agentsam-workbench/project-control.css';
import { createGanttModel } from '@inneranimalmedia/work-graph/renderers/gantt-model';
import './styles.css';

const projects = [
  {
    id: 'agentsam-sdk',
    name: 'AgentSam SDK',
    description: 'Project Control, reusable work surfaces, runtime, packages and releases.',
    repository: 'github.com/SamPrimeaux/agentsam-sdk',
    branch: 'feat/project-control-workbench-20260925',
    status: 'active',
    health: 'active' as const,
    objective: 'Ship polished Project Control',
    progress: 0.68,
    updatedAt: 'Updated just now',
    stats: [
      { label: 'active jobs', value: 3 },
      { label: 'blockers', value: 1 },
      { label: 'packages', value: 27 },
    ],
  },
  {
    id: 'fuelnfreetime',
    name: 'Fuel & Free Time',
    description: 'Commerce, CMS, Completeful fulfillment, media and storefront systems.',
    repository: 'fuelnfreetime.com',
    branch: 'main',
    status: 'healthy',
    health: 'healthy' as const,
    objective: 'Finish reusable CMS storefront spine',
    progress: 0.81,
    updatedAt: 'Updated 8m ago',
    stats: [
      { label: 'products', value: 3 },
      { label: 'orders', value: 9 },
      { label: 'open tickets', value: 4 },
    ],
  },
  {
    id: 'theme-refinery',
    name: 'Theme Refinery',
    description: 'Mine archived sites into reusable tokens, assets, sections, layouts and themes.',
    repository: 'AgentSam design system',
    branch: 'main',
    status: 'active',
    health: 'active' as const,
    objective: 'Normalize historical sites without flattening bespoke work',
    progress: 0.52,
    updatedAt: 'Updated 24m ago',
    stats: [
      { label: 'themes', value: 8 },
      { label: 'token families', value: 14 },
      { label: 'candidates', value: 31 },
    ],
  },
  {
    id: 'cad-creator',
    name: 'CAD Creator',
    description: 'Portable CAD and robotics environment for FreeCAD, OpenSCAD, Blender and Meshy.',
    repository: 'apps/cad-creator',
    branch: 'main',
    status: 'planning',
    health: 'idle' as const,
    objective: 'Package reliable provider/tool detection',
    progress: null,
    updatedAt: 'Updated yesterday',
    stats: [
      { label: 'providers', value: 4 },
      { label: 'work items', value: 12 },
      { label: 'blockers', value: 0 },
    ],
  },
];

const graph = {
  id: 'new-design-startup',
  name: 'New Design Startup',
  actors: [
    { id: 'sam', name: 'Sam', role: 'owner' },
    { id: 'agentsam', name: 'AgentSam', role: 'agent' },
  ],
  items: [
    { id: 'brand', title: 'Brand', type: 'task', status: 'active', owner: 'sam', start: '2026-09-25', end: '2026-09-27', baselineStart: '2026-09-25', baselineEnd: '2026-09-26', progress: .72, parentId: 'design', estimateMinutes: 300, actualMinutes: 221, dependencies: [], metadata: { summary: 'Audit, normalize and package brand tokens, typography, marks and reusable assets.' }, artifacts: [{ name: 'brand-token-set' }], evidence: ['brand-audit', 'token-receipt'] },
    { id: 'homepage', title: 'Homepage', type: 'task', status: 'active', owner: 'agentsam', start: '2026-09-26', end: '2026-09-29', progress: .45, parentId: 'design', dependencies: ['brand'], estimateMinutes: 420, actualMinutes: 188, metadata: { summary: 'Compose the homepage from reusable CMS sections and the selected theme contract.' }, artifacts: [{ name: 'home-composition' }], evidence: ['preview-1'] },
    { id: 'features', title: 'Features Page', type: 'task', status: 'planned', owner: 'agentsam', start: '2026-09-29', end: '2026-10-01', progress: 0, parentId: 'design', dependencies: ['homepage'], estimateMinutes: 260, metadata: { summary: 'Build the reusable features composition and verify section settings in the editor.' }, artifacts: [], evidence: [] },
    { id: 'photography', title: 'Photography', type: 'task', status: 'active', owner: 'sam', start: '2026-09-28', end: '2026-10-01', progress: .35, parentId: 'design', dependencies: [], estimateMinutes: 180, actualMinutes: 64, metadata: { summary: 'Select, normalize and register reusable media assets for the site.' }, artifacts: [{ name: 'asset-pack' }], evidence: [] },
    { id: 'design-complete', title: 'Design Complete', type: 'milestone', status: 'planned', owner: 'sam', start: '2026-10-01', end: '2026-10-01', parentId: 'design', dependencies: ['features', 'photography'], metadata: { summary: 'Design approval milestone. Theme, composition and core assets are ready for build.' }, artifacts: [], evidence: [] },
    { id: 'servers', title: 'Setup Servers', type: 'task', status: 'complete', owner: 'agentsam', start: '2026-09-29', end: '2026-09-30', progress: 1, parentId: 'build', dependencies: [], estimateMinutes: 120, actualMinutes: 104, metadata: { summary: 'Provision the selected runtime and verify environment connectivity.' }, artifacts: [], evidence: ['runtime-receipt'] },
    { id: 'template', title: 'Build Template', type: 'task', status: 'active', owner: 'agentsam', start: '2026-09-30', end: '2026-10-02', baselineStart: '2026-09-30', baselineEnd: '2026-10-01', progress: .55, parentId: 'build', dependencies: ['servers', 'design-complete'], estimateMinutes: 360, actualMinutes: 191, metadata: { summary: 'Package reusable composition, sections and theme settings into the installable CMS template.' }, artifacts: [{ name: 'theme-package' }, { name: 'composition-receipt' }], evidence: ['theme-check'] },
    { id: 'test', title: 'Test', type: 'task', status: 'planned', owner: 'sam', start: '2026-10-02', end: '2026-10-04', progress: null, parentId: 'build', dependencies: ['template'], estimateMinutes: 300, metadata: { summary: 'Responsive, accessibility, performance, contract and publish rehearsal.' }, artifacts: [], evidence: [] },
    { id: 'launch', title: 'Launch', type: 'milestone', status: 'planned', owner: 'sam', start: '2026-10-05', end: '2026-10-05', parentId: 'build', dependencies: ['test'], metadata: { summary: 'Production launch milestone after verification gates pass.' }, artifacts: [], evidence: [] },
  ],
};

const ganttItems = createGanttModel(graph);

const groups = [
  { id: 'design', title: 'Design', start: '2026-09-25', end: '2026-10-01', progress: .58 },
  { id: 'build', title: 'Build', start: '2026-09-29', end: '2026-10-05', progress: .32 },
];

function useRoute() {
  const [path, setPath] = useState(window.location.pathname);
  const go = (next: string) => {
    window.history.pushState({}, '', next);
    setPath(next);
  };
  return { path, go };
}

function ActionButton({ label, children, onClick, active = false }: { label: string; children: React.ReactNode; onClick?: () => void; active?: boolean }) {
  return <button type="button" className="pc-icon-button" data-active={active || undefined} aria-label={label} title={label} onClick={onClick}>{children}</button>;
}

function App() {
  const { path, go } = useRoute();
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [annotating, setAnnotating] = useState(false);
  const [selectedTask, setSelectedTask] = useState<string | null>('brand');
  const [filter, setFilter] = useState('All');

  const gantt = path === '/prototype-gnantt' || path === '/projects/gantt';
  const navValue = useMemo(() => ({
    brand: { name: 'AgentSam', home: '/' },
    project: gantt ? { id: 'new-design-startup', name: 'New Design Startup' } : undefined,
    projects: projects.map((project) => ({ id: project.id, name: project.name, pinned: project.id === 'agentsam-sdk' })),
    account: { id: 'local', name: 'Local account', plan: 'Developer' },
    destinations: [
      { id: 'sites', label: 'Sites', icon: <Layers3 size={17} />, onSelect: () => go('/') },
      { id: 'systems', label: 'Systems', icon: <CircleDot size={17} />, onSelect: () => go('/') },
      { id: 'goals', label: 'Goals', icon: <Goal size={17} />, onSelect: () => go('/') },
      { id: 'tickets', label: 'Tickets', icon: <TicketCheck size={17} />, onSelect: () => go('/') },
      { id: 'calendar', label: 'Calendar', icon: <CalendarDays size={17} />, onSelect: () => go('/') },
      { id: 'collaborate', label: 'Collaborate', icon: <MessageSquareText size={17} />, onSelect: () => go('/') },
    ],
    onNavigate: (href: string) => go(href),
    onSelectProject: () => go('/prototype-gnantt'),
  }), [gantt]);

  const tokens = theme === 'light'
    ? { canvas: '#f6f7f9', sidebar: '#ffffff', surface: '#ffffff', popover: '#ffffff', text: '#17191f', muted: '#777d87', border: '#e1e4ea', hover: '#f4f5f7', selected: '#eef3ff', danger: '#d94e5f', shadow: '0 20px 50px rgba(30,40,60,.10)' }
    : { canvas: '#0b0d11', sidebar: '#11141a', surface: '#11141a', popover: '#171b23', text: '#f5f7fb', muted: '#8f97a6', border: '#262c36', hover: '#171b23', selected: '#202744', danger: '#f06b78', shadow: '0 24px 70px rgba(0,0,0,.34)' };

  return (
    <Nav.Provider value={navValue} theme={theme} tokens={tokens} accentColor={theme === 'light' ? '#2563eb' : '#7c8cff'} defaultOpen peekable resizable>
      <div className="pc-app" data-project-control-theme={theme}>
        <Nav.Sidenav />
        <div className="pc-stage">
          <Nav.Topbar className="pc-topbar">
            <div className="pc-topbar__left">
              <Nav.Trigger />
              <button type="button" className="pc-wordmark" onClick={() => go('/')}>AgentSam</button>
              <span className="pc-topbar__crumb">{gantt ? 'Projects / New Design Startup' : 'Projects'}</span>
            </div>
            <label className="pc-search">
              <Search size={15} />
              <input placeholder="Search projects, tasks, packages, sites..." />
              <kbd>⌘K</kbd>
            </label>
            <div className="pc-topbar__actions">
              <ActionButton label="Toggle theme" onClick={() => setTheme((value) => value === 'light' ? 'dark' : 'light')}>{theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}</ActionButton>
              <ActionButton label="Annotate" onClick={() => setAnnotating((value) => !value)} active={annotating}><Sparkles size={17} /></ActionButton>
              <ActionButton label="Ask AgentSam" onClick={() => setAssistantOpen(true)} active={assistantOpen}><Bot size={18} /></ActionButton>
              <div className="pc-notification-wrap">
                <ActionButton label="Notifications" onClick={() => setNotificationsOpen((value) => !value)} active={notificationsOpen}><Bell size={17} /></ActionButton>
                {notificationsOpen ? (
                  <div className="pc-notifications">
                    <div><strong>Notifications</strong><span>Scaffold</span></div>
                    <p>No unread notifications yet.</p>
                    <small>Runtime alerts, approvals and review requests will land here.</small>
                  </div>
                ) : null}
              </div>
            </div>
          </Nav.Topbar>

          {annotating ? <div className="pc-annotation-banner">Annotation mode · select any work item or surface · Esc to exit</div> : null}

          <main className="pc-main">
            {gantt ? (
              <GanttBoard
                title="New Design Startup"
                subtitle="Brand → composition → build → verification → launch"
                items={ganttItems}
                groups={groups}
                rangeStart="2026-09-25"
                rangeEnd="2026-10-05"
                today="2026-09-25"
                selectedId={selectedTask}
                onSelect={(item) => setSelectedTask(item?.id ?? null)}
                onCreateTask={() => setSelectedTask(null)}
              />
            ) : (
              <ProjectsSurface
                projects={projects}
                activeFilter={filter}
                onFilterChange={setFilter}
                onOpenProject={() => go('/prototype-gnantt')}
                onCreateProject={() => go('/prototype-gnantt')}
              />
            )}
          </main>
        </div>

        {assistantOpen ? (
          <aside className="pc-assistant" aria-label="AgentSam assistant">
            <div className="pc-assistant__header">
              <div><span className="pc-assistant__mark"><Bot size={18} /></span><div><strong>AgentSam</strong><small>{gantt ? 'New Design Startup' : 'Projects'}</small></div></div>
              <button type="button" onClick={() => setAssistantOpen(false)}>×</button>
            </div>
            <div className="pc-assistant__body">
              <div className="pc-assistant__context">
                <span>Context</span>
                <strong>{gantt ? 'Project schedule + WorkGraph' : 'Project catalog'}</strong>
                <p>{gantt ? 'I can explain blockers, review dependencies, summarize time spent, or propose a schedule change.' : 'I can summarize active work, open the most relevant project, or create a project plan.'}</p>
              </div>
              <div className="pc-assistant__suggestions">
                {(gantt ? ['Summarize this schedule', 'Show critical blockers', 'Explain Brand outputs', 'Prepare launch checklist'] : ['What needs attention?', 'Open AgentSam SDK', 'Summarize active projects', 'Create design startup']).map((label) => <button type="button" key={label}>{label}</button>)}
              </div>
            </div>
            <div className="pc-assistant__composer">
              <textarea rows={3} placeholder="Ask AgentSam about this work..." />
              <button type="button">Send</button>
            </div>
          </aside>
        ) : null}
      </div>
    </Nav.Provider>
  );
}

createRoot(document.getElementById('root')!).render(<App />);

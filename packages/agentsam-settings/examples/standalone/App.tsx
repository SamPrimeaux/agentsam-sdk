import { useEffect, useMemo, useState } from 'react';
import {
  BrandPluginWorkspace,
  SettingsProductPage,
  SettingsShell,
  createFixtureSettingsHost,
  defineSettingsManifest,
  degradedSettingsFixture,
  firstRunSettingsFixture,
  populatedSettingsFixture,
  type SettingsUnitId,
} from '../../dist/index.js';
import { emptyBrandWorkspaceFixture, sampleBrandWorkspaceFixture } from './brand-fixtures';

type FixtureMode = 'first-run' | 'populated' | 'degraded';
type PageMode = 'settings' | 'brand';
type BrandMode = 'empty' | 'sample';

const manifest = defineSettingsManifest({
  productName: 'AgentSam Settings',
  units: [
    { id: 'general', label: 'Account', description: 'Account, appearance and application preferences.', icon: 'settings' },
    { id: 'agents', label: 'Agents', description: 'Agent configuration, cloud execution, models and policies.', icon: 'bot', views: [{ id: 'overview', label: 'Overview' }, { id: 'cloud', label: 'Cloud' }, { id: 'models', label: 'Models' }, { id: 'policy', label: 'Policy' }] },
    { id: 'customize', label: 'Customize', description: 'Apps, plugins, widgets, companions and advanced capabilities.', icon: 'sliders', views: [{ id: 'plugins', label: 'Plugins' }, { id: 'apps', label: 'Apps' }, { id: 'companions', label: 'Companions' }, { id: 'widgets', label: 'Widgets' }, { id: 'mcps', label: 'MCPs' }, { id: 'skills', label: 'Skills' }, { id: 'subagents', label: 'Subagents' }, { id: 'rules', label: 'Rules' }, { id: 'commands', label: 'Commands' }, { id: 'hooks', label: 'Hooks' }] },
    { id: 'design', label: 'Brand & Design', description: 'Brand identities, design tokens and visual systems.', icon: 'palette' },
    { id: 'git-prs', label: 'Git & PRs', description: 'Repository authorization and pull request workflows.', icon: 'git' },
    { id: 'codebase', label: 'Codebase', description: 'Repository and code indexing preferences.', icon: 'code' },
    { id: 'network', label: 'Browser & Network', description: 'Browser access, network policy and connections.', icon: 'network' },
    { id: 'runtime', label: 'Machines & Runtimes', description: 'Execution hosts and runtime capabilities.', icon: 'runtime' },
    { id: 'themes', label: 'Themes', description: 'Installed shell themes and appearance presets.', icon: 'theme' },
    { id: 'storage', label: 'Storage', description: 'Local and connected storage providers.', icon: 'storage' },
    { id: 'keys', label: 'Keys & Secrets', description: 'Account credentials and provider secrets.', icon: 'key', views: [{ id: 'credentials', label: 'Credentials' }, { id: 'secrets', label: 'Secrets' }] },
    { id: 'usage', label: 'Plan & Usage', description: 'Usage, activity and account limits.', icon: 'usage' },
    { id: 'notifications', label: 'Notifications', description: 'Notification destinations and event preferences.', icon: 'bell' },
    { id: 'docs', label: 'Docs', description: 'Product guides and contextual help.', icon: 'docs' },
  ],
});

const defaultView = (unit: SettingsUnitId) => unit === 'customize' ? 'plugins' : unit === 'agents' ? 'overview' : unit === 'keys' ? 'credentials' : '';
const fixtureFor = (mode: FixtureMode) => mode === 'first-run' ? firstRunSettingsFixture : mode === 'degraded' ? degradedSettingsFixture : populatedSettingsFixture;

function readLocation() {
  const query = new URLSearchParams(window.location.search);
  const unitValue = query.get('unit') as SettingsUnitId | null;
  const units = manifest.units.map(unit => unit.id);
  return {
    page: query.get('page') === 'brand' ? 'brand' as PageMode : 'settings' as PageMode,
    unit: unitValue && units.includes(unitValue) ? unitValue : 'customize' as SettingsUnitId,
    view: query.get('view') || 'widgets',
    fixture: (['first-run', 'populated', 'degraded'].includes(query.get('fixture') || '') ? query.get('fixture') : 'populated') as FixtureMode,
    brand: query.get('brand') === 'empty' ? 'empty' as BrandMode : 'sample' as BrandMode,
  };
}

export default function App() {
  const initial = useMemo(readLocation, []);
  const [page, setPage] = useState<PageMode>(initial.page);
  const [unit, setUnit] = useState<SettingsUnitId>(initial.unit);
  const [view, setView] = useState(initial.view || defaultView(initial.unit));
  const [fixture, setFixture] = useState<FixtureMode>(initial.fixture);
  const [brandMode, setBrandMode] = useState<BrandMode>(initial.brand);

  const writeLocation = (next: Partial<{ page: PageMode; unit: SettingsUnitId; view: string; fixture: FixtureMode; brand: BrandMode }>) => {
    const query = new URLSearchParams(window.location.search);
    query.set('page', next.page ?? page);
    query.set('unit', next.unit ?? unit);
    query.set('view', next.view ?? view);
    query.set('fixture', next.fixture ?? fixture);
    query.set('brand', next.brand ?? brandMode);
    const nextPage = next.page ?? page;
    const nextUnit = next.unit ?? unit;
    const nextView = next.view ?? view;
    if (nextPage === 'brand' || nextUnit !== 'customize' || nextView !== 'plugins') query.delete('plugin');
    window.history.pushState({}, '', `${window.location.pathname}?${query.toString()}`);
  };

  useEffect(() => {
    const onPopState = () => {
      const next = readLocation();
      setPage(next.page); setUnit(next.unit); setView(next.view); setFixture(next.fixture); setBrandMode(next.brand);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const host = useMemo(() => {
    const base = createFixtureSettingsHost(fixtureFor(fixture));
    return {
      ...base,
      openSettingsUnit: (nextUnit: SettingsUnitId) => {
        setPage('settings'); setUnit(nextUnit); setView(defaultView(nextUnit));
        writeLocation({ page: 'settings', unit: nextUnit, view: defaultView(nextUnit) });
      },
      openPluginWorkspace: (_pluginKey: string) => {
        setPage('settings'); setUnit('customize'); setView('plugins');
        writeLocation({ page: 'settings', unit: 'customize', view: 'plugins' });
      },
      readPluginWorkspace: async (_pluginId: string) => ({
        pluginKey: 'agentsam-brand',
        contextTool: 'brand_workspace_read',
        result: sampleBrandWorkspaceFixture,
      }),
    };
  }, [fixture]);

  const navigate = (nextUnit: SettingsUnitId) => {
    setPage('settings'); setUnit(nextUnit); setView(defaultView(nextUnit));
    writeLocation({ page: 'settings', unit: nextUnit, view: defaultView(nextUnit) });
  };
  const chooseView = (nextView: string) => {
    setView(nextView);
    writeLocation({ view: nextView });
  };
  const choosePage = (nextPage: PageMode) => {
    setPage(nextPage);
    writeLocation({ page: nextPage, unit: nextPage === 'brand' ? 'customize' : unit });
    if (nextPage === 'brand') setUnit('customize');
  };
  const chooseFixture = (nextFixture: FixtureMode) => {
    setFixture(nextFixture);
    writeLocation({ fixture: nextFixture });
  };
  const chooseBrandMode = (nextBrand: BrandMode) => {
    setBrandMode(nextBrand);
    writeLocation({ brand: nextBrand, page: 'brand' });
  };

  return (
    <div className="preview-app">
      <header className="preview-header">
        <div className="preview-brand">
          <span>AgentSam Settings</span>
          <span className="preview-badge">Standalone package preview</span>
        </div>
        <div className="preview-controls" aria-label="Preview controls">
          <button className="preview-control" aria-pressed={page === 'settings'} onClick={() => choosePage('settings')}>Settings package</button>
          <button className="preview-control" aria-pressed={page === 'brand'} onClick={() => choosePage('brand')}>Brand workspace</button>
          <span className="preview-control" aria-hidden="true">Host fixture</span>
          {(['first-run', 'populated', 'degraded'] as FixtureMode[]).map(mode => <button key={mode} className="preview-control" aria-pressed={fixture === mode} onClick={() => chooseFixture(mode)}>{mode === 'first-run' ? 'First run' : mode === 'populated' ? 'Populated' : 'Degraded'}</button>)}
          {page === 'brand' ? <>
            <button className="preview-control" aria-pressed={brandMode === 'empty'} onClick={() => chooseBrandMode('empty')}>Empty brand state</button>
            <button className="preview-control" aria-pressed={brandMode === 'sample'} onClick={() => chooseBrandMode('sample')}>Sample brand</button>
          </> : null}
        </div>
      </header>
      <div className="preview-content">
        <SettingsShell
          manifest={manifest}
          activeUnit={unit}
          onNavigate={navigate}
          rootLabel="Standalone preview"
          railStatus={{ title: 'Fixture host', detail: 'Synthetic records only. No customer data, provider tokens or live OAuth sessions.' }}
        >
          {page === 'settings' ? (
            <SettingsProductPage manifest={manifest} host={host} unitId={unit} requestedView={view} onViewChange={chooseView} />
          ) : (
            <div className="preview-workspace">
              <p className="preview-workspace-title">Brand workspace</p>
              <p className="preview-workspace-subtitle">The actual packaged BrandPluginWorkspace component, rendered independently of Local Studio.</p>
              <div className="preview-note">
                This component is currently read-only. It presents saved brand contracts, assets, sources, themes and review information; it does not create or edit brands, modify assets, approve contracts or publish identities.
                {brandMode === 'sample' ? ' The Northstar Goods record below is synthetic demo data and is not saved anywhere.' : ' This is the empty first-run state with no saved brand identities.'}
              </div>
              <BrandPluginWorkspace data={brandMode === 'empty' ? emptyBrandWorkspaceFixture : sampleBrandWorkspaceFixture} />
            </div>
          )}
        </SettingsShell>
      </div>
    </div>
  );
}

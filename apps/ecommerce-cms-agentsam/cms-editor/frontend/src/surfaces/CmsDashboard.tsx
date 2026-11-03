import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  CmsActivityRow,
  CmsDashboardSetupMode,
  CmsModuleDef,
  CmsQuickAction,
  CmsWorkspaceContext,
  CmsWorkspaceSite,
} from './types';
import { CmsSiteSwitcher } from './CmsSiteSwitcher';
import { buildCmsHubPath, buildCmsPath } from '@inneranimalmedia/agentsam-cms-backend/routing';

export type CmsDashboardProps = {
  siteSlug: string | null;
  setupMode: CmsDashboardSetupMode;
  site?: CmsWorkspaceSite | null;
  sites?: CmsWorkspaceSite[];
  context?: CmsWorkspaceContext | null;
  onNavigate: (path: string) => void;
  onSelectSite?: (slug: string, path: string) => void | Promise<void>;
  onOpenDeployWizard?: () => void;
};

function formatWhen(value: unknown): string {
  if (value == null || value === '') return 'Recently';
  const n = Number(value);
  const d = Number.isFinite(n) && n > 100000 ? new Date(n * 1000) : new Date(String(value));
  if (Number.isNaN(d.getTime())) return 'Recently';
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function activityLabel(row: CmsActivityRow): string {
  const action = String(row.action || 'update').replace(/_/g, ' ');
  const type = String(row.resource_type || '').replace(/_/g, ' ');
  let detail = '';
  if (row.details) {
    try {
      const parsed = typeof row.details === 'string' ? JSON.parse(row.details) : row.details;
      detail = String(parsed.section_name || parsed.route_path || parsed.template_id || '').trim();
    } catch {
      detail = typeof row.details === 'string' ? row.details.slice(0, 48) : '';
    }
  }
  return [action, type, detail || row.resource_id].filter(Boolean).join(' · ');
}

function activityStatus(row: CmsActivityRow): 'published' | 'draft' {
  const action = String(row.action || '').toLowerCase();
  if (action.includes('publish') || action.includes('deploy')) return 'published';
  return 'draft';
}

export function CmsDashboard({
  siteSlug,
  setupMode,
  site = null,
  sites = [],
  context = null,
  onNavigate,
  onSelectSite,
  onOpenDeployWizard,
}: CmsDashboardProps) {
  const [pagesCount, setPagesCount] = useState<number>(0);
  const [draftsCount, setDraftsCount] = useState<number>(0);
  const [assetsCount, setAssetsCount] = useState<number>(0);
  const [activities, setActivities] = useState<CmsActivityRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  const hasActiveSite = Boolean(siteSlug && setupMode === 'active');

  useEffect(() => {
    if (!siteSlug) return;
    let cancelled = false;
    setLoading(true);

    async function loadData() {
      try {
        const [bootRes, actRes] = await Promise.all([
          fetch(`/api/cms/bootstrap?site=${encodeURIComponent(siteSlug || '')}`).catch(() => null),
          fetch(`/api/cms/activity?site=${encodeURIComponent(siteSlug || '')}`).catch(() => null),
        ]);

        if (cancelled) return;

        if (bootRes && bootRes.ok) {
          const data = await bootRes.json();
          const pages = Array.isArray(data.pages) ? data.pages : [];
          setPagesCount(pages.length);
          const drafts = pages.filter((p: any) => p.published === 0 || p.published === false || p.status === 'draft').length;
          setDraftsCount(drafts);
          const assets = Array.isArray(data.assets) ? data.assets : [];
          setAssetsCount(assets.length);
        }

        if (actRes && actRes.ok) {
          const data = await actRes.json();
          setActivities(Array.isArray(data.activity) ? data.activity : []);
        }
      } catch (err) {
        console.error('Failed to load CMS dashboard data:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadData();
    return () => {
      cancelled = true;
    };
  }, [siteSlug]);

  const modules: CmsModuleDef[] = useMemo(
    () => [
      {
        id: 'content',
        title: 'Content',
        desc: 'Create, organize, and publish content across your site.',
        sub: hasActiveSite && !loading ? `${draftsCount} draft${draftsCount === 1 ? '' : 's'}` : '—',
        path: siteSlug ? buildCmsPath({ panel: 'pages', siteSlug }) : '',
        cta: 'Manage content →',
      },
      {
        id: 'media',
        title: 'Media',
        desc: 'Manage images, videos, and files in your media library.',
        sub: hasActiveSite && !loading ? `${assetsCount} asset${assetsCount === 1 ? '' : 's'}` : '—',
        path: siteSlug ? buildCmsPath({ panel: 'media', siteSlug }) : '',
        cta: 'Open media library →',
      },
      {
        id: 'structure',
        title: 'Structure',
        desc: 'Organize your site structure, menus, and navigation.',
        sub: hasActiveSite && !loading ? `${pagesCount} page${pagesCount === 1 ? '' : 's'}` : '—',
        path: siteSlug ? buildCmsPath({ panel: 'pages', siteSlug }) : '',
        cta: 'View structure →',
      },
      {
        id: 'settings',
        title: 'Settings',
        desc: 'Configure your site settings, domains, and preferences.',
        sub: hasActiveSite && !loading ? 'Configured' : '—',
        path: siteSlug ? buildCmsPath({ panel: 'online-store', siteSlug }) : '',
        cta: 'Site settings →',
      },
    ],
    [hasActiveSite, loading, draftsCount, assetsCount, pagesCount, siteSlug],
  );

  const quickActions: CmsQuickAction[] = useMemo(
    () => [
      { label: 'Create new page', path: siteSlug ? `${buildCmsPath({ panel: 'pages', siteSlug })}&create=1` : '' },
      { label: 'Browse templates', path: siteSlug ? buildCmsPath({ panel: 'templates', siteSlug }) : '' },
      { label: 'Upload media', path: siteSlug ? buildCmsPath({ panel: 'media', siteSlug }) : '' },
      { label: 'Theme editor', path: siteSlug ? buildCmsPath({ panel: 'theme-editor', siteSlug }) : '' },
    ],
    [siteSlug],
  );

  return (
    <div className="iam-cms-dashboard">
      <section className="iam-cms-card iam-cms-site-hero">
        <div className="iam-cms-site-hero__head">
          <div>
            <p className="iam-cms-site-hero__suite">Active site</p>
            <h2 className="iam-cms-site-hero__name">{site?.name || siteSlug || 'AgentSam Site'}</h2>
            {site?.domain && (
              <a
                href={`https://${site.domain}`}
                target="_blank"
                rel="noreferrer"
                className="iam-cms-site-hero__domain"
              >
                {site.domain}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </a>
            )}
          </div>
          <CmsSiteSwitcher
            sites={sites}
            activeSlug={siteSlug}
            size="sm"
            onSelect={(slug) => {
              if (onSelectSite) void onSelectSite(slug, buildCmsHubPath(slug));
            }}
            onNewSite={onOpenDeployWizard}
          />
        </div>

        <div className="iam-cms-site-hero__stats" aria-label="Site metrics">
          <div className="iam-cms-stat">
            <div className="iam-cms-stat__label">Pages</div>
            <div className="iam-cms-stat__value">{loading ? '—' : pagesCount}</div>
          </div>
          <div className="iam-cms-stat">
            <div className="iam-cms-stat__label">Drafts</div>
            <div className="iam-cms-stat__value">{loading ? '—' : draftsCount}</div>
          </div>
          <div className="iam-cms-stat">
            <div className="iam-cms-stat__label">Media assets</div>
            <div className="iam-cms-stat__value">{loading ? '—' : assetsCount}</div>
          </div>
          <div className="iam-cms-stat">
            <div className="iam-cms-stat__label">Status</div>
            <div className="iam-cms-stat__value iam-cms-stat__value--ok">Live</div>
          </div>
        </div>

        <div className="iam-cms-site-hero__actions">
          <button
            type="button"
            className="iam-cms-btn iam-cms-btn--primary"
            onClick={() => {
              if (siteSlug) onNavigate(buildCmsPath({ panel: 'theme-editor', siteSlug }));
            }}
          >
            Design site
          </button>
          <button
            type="button"
            className="iam-cms-btn iam-cms-btn--secondary"
            onClick={() => {
              if (siteSlug) onNavigate(buildCmsPath({ panel: 'pages', siteSlug }));
            }}
          >
            Edit pages
          </button>
          <button
            type="button"
            className="iam-cms-btn iam-cms-btn--ghost"
            onClick={() => {
              if (siteSlug) onNavigate(buildCmsPath({ panel: 'online-store', siteSlug }));
            }}
          >
            Site settings
          </button>
        </div>
      </section>

      <section className="iam-cms-modules-section" aria-label="CMS Modules">
        <h3 className="iam-cms-section-title">Modules</h3>
        <div className="iam-cms-modules-grid">
          {modules.map((mod) => (
            <article
              key={mod.id}
              className="iam-cms-card iam-cms-module"
              onClick={() => {
                if (mod.path) onNavigate(mod.path);
              }}
            >
              <div className="iam-cms-module__header">
                <h4 className="iam-cms-module__title">{mod.title}</h4>
                <span className="iam-cms-module__badge">{mod.sub}</span>
              </div>
              <p className="iam-cms-module__desc">{mod.desc}</p>
              <div className="iam-cms-module__cta">{mod.cta}</div>
            </article>
          ))}
        </div>
      </section>

      <section className="iam-cms-quick-actions" aria-label="Quick Actions">
        <h3 className="iam-cms-section-title">Quick Actions</h3>
        <div className="iam-cms-quick-actions__list">
          {quickActions.map((qa) => (
            <button
              key={qa.label}
              type="button"
              className="iam-cms-pill-btn"
              onClick={() => {
                if (qa.path) onNavigate(qa.path);
              }}
            >
              {qa.label}
            </button>
          ))}
        </div>
      </section>

      <section className="iam-cms-activity-section" aria-label="Recent Activity">
        <h3 className="iam-cms-section-title">Recent Activity</h3>
        <div className="iam-cms-card iam-cms-activity-card">
          {activities.length === 0 ? (
            <p className="iam-cms-empty-state">No recent activity recorded for this site.</p>
          ) : (
            <ul className="iam-cms-activity-list">
              {activities.slice(0, 8).map((act, idx) => {
                const status = activityStatus(act);
                return (
                  <li key={act.id || idx} className="iam-cms-activity-item">
                    <span className={`iam-cms-status-pill iam-cms-status-pill--${status}`}>
                      {status}
                    </span>
                    <span className="iam-cms-activity-item__label">{activityLabel(act)}</span>
                    <time className="iam-cms-activity-item__time">{formatWhen(act.created_at)}</time>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

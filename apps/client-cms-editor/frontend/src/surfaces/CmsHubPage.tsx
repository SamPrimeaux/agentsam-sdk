import React, { useMemo } from 'react';
import type { CmsDashboardSetupMode, CmsWorkspaceContext, CmsWorkspaceSite } from './types';
import { CmsDashboard } from './CmsDashboard';
import { CmsGuidedChatHero } from './CmsGuidedChatHero';
import { CmsSiteSwitcher } from './CmsSiteSwitcher';
import { buildCmsHubPath } from '@inneranimalmedia/agentsam-cms-backend/routing';
import '../styles/cmsShell.css';

export type CmsHubPageProps = {
  context?: CmsWorkspaceContext | null;
  sites: CmsWorkspaceSite[];
  activeSiteSlug: string | null;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onSelectSite: (slug: string, path: string) => void | Promise<void>;
  onNavigate: (path: string) => void;
  onOpenDeployWizard?: () => void;
  onSendChatMessage?: (message: string) => void;
};

export function CmsHubPage({
  context = null,
  sites = [],
  activeSiteSlug,
  loading = false,
  error = null,
  onRetry,
  onSelectSite,
  onNavigate,
  onOpenDeployWizard,
  onSendChatMessage,
}: CmsHubPageProps) {
  const resolvedSiteSlug = useMemo(() => {
    if (activeSiteSlug) return activeSiteSlug;
    const stored = sites.find((s) => s.slug === context?.project_slug);
    if (context?.project_slug && stored) return context.project_slug;
    if (sites.length === 1) return sites[0].slug;
    if (sites.length > 0) return sites[0].slug;
    return 'agentsam-sdk';
  }, [activeSiteSlug, sites, context?.project_slug]);

  const setupMode: CmsDashboardSetupMode = useMemo(() => {
    if (loading) return 'loading';
    if (sites.length === 0) return 'deploy';
    if (resolvedSiteSlug) return 'active';
    return 'pick-site';
  }, [loading, sites.length, resolvedSiteSlug]);

  const activeSite = useMemo(() => {
    const rows = Array.isArray(sites) ? sites : [];
    return rows.find((s) => s.slug === resolvedSiteSlug) || null;
  }, [sites, resolvedSiteSlug]);

  return (
    <div className="iam-cms-shell iam-cms-hub-page">
      <div className="iam-cms-hub-page__scroll">
        <CmsGuidedChatHero
          siteSlug={resolvedSiteSlug}
          siteName={activeSite?.name || context?.project_name || resolvedSiteSlug}
          onSend={onSendChatMessage}
        />

        <div className="iam-cms-hub-page__body">
          <div className="iam-cms-hub-page__toolbar iam-cms-hub-page__toolbar--compact">
            <CmsSiteSwitcher
              sites={sites}
              activeSlug={resolvedSiteSlug}
              size="sm"
              disabled={loading}
              onSelect={(slug) => {
                void onSelectSite(slug, buildCmsHubPath(slug));
              }}
              onNewSite={onOpenDeployWizard}
            />
            <div className="iam-cms-shell__actions">
              {onRetry && (
                <button
                  type="button"
                  className="iam-cms-shell__nav-link"
                  onClick={() => onRetry()}
                  disabled={loading}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={loading ? 'animate-spin' : ''}
                    aria-hidden
                  >
                    <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <path d="M3 3v5h5" />
                    <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                    <path d="M16 21h5v-5" />
                  </svg>
                  Refresh
                </button>
              )}
            </div>
          </div>

          {error ? (
            <div className="iam-cms-card iam-cms-card--error" role="alert">
              <p className="iam-cms-card__error-text">{error}</p>
              {onRetry && (
                <button type="button" className="iam-cms-btn iam-cms-btn--secondary" onClick={() => onRetry()}>
                  Try again
                </button>
              )}
            </div>
          ) : (
            <CmsDashboard
              siteSlug={resolvedSiteSlug}
              setupMode={setupMode}
              site={activeSite}
              sites={sites}
              context={context}
              onNavigate={onNavigate}
              onSelectSite={onSelectSite}
              onOpenDeployWizard={onOpenDeployWizard}
            />
          )}
        </div>
      </div>
    </div>
  );
}

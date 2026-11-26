import { useEffect, useRef, useState } from 'react';
import { createFileRoute, Navigate, useLocation } from '@tanstack/react-router';
import { useCurrentUserState } from '@/lib/auth/use-current-user';
import { RedirectToSignIn } from '@/lib/auth/gates';
import { themeStoreTrySelection } from '@/lib/apps/theme-store-selection';
import { navigateApp } from '@/lib/work/navigate';

type ThemeSelection = NonNullable<ReturnType<typeof themeStoreTrySelection>>;
type InstallState = 'installing' | 'opening' | 'error';

/**
 * Lightweight, authenticated Theme Store install receiver. The server owns
 * checksum verification and all CMS persistence. Do not mount the Online Store
 * iframe or any storefront preview merely to create an editable draft.
 */
function ThemeStoreInstallEntry({ selection }: { selection: ThemeSelection }) {
  const { user, isPending } = useCurrentUserState();
  const [attempt, setAttempt] = useState(0);
  const startedAttempt = useRef(-1);
  const [state, setState] = useState<InstallState>('installing');
  const [error, setError] = useState<string | null>(null);
  const slug = selection.theme_sku.slice('iam.theme.'.length);
  const version = selection.theme_version;

  useEffect(() => {
    if (isPending || !user || startedAttempt.current === attempt) return;
    // React StrictMode can replay effects. Each deliberate Add attempt must
    // initiate at most one POST, never two theme drafts.
    startedAttempt.current = attempt;
    setState('installing');
    setError(null);
    void (async () => {
      try {
        const response = await fetch('/api/admin/website-themes/' + encodeURIComponent(slug) + '/install', {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ version }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result.ok !== true) {
          throw new Error(typeof result.error === 'string'
            ? result.error : 'Theme installation was not completed (HTTP ' + response.status + ')');
        }
        if (result.scope !== 'account' || result.site_id ||
            !new RegExp('^theme_'+slug+'_[a-f0-9]{32}$').test(result.project_id || '')) {
          throw new Error('The installer did not return an account-owned Theme Studio draft.');
        }
        const destination = new URL(result.editor_url, window.location.origin);
        if(destination.origin!==window.location.origin || destination.pathname!=='/admin/theme-editor' ||
           destination.searchParams.get('project')!==result.project_id ||
           !/^[A-Za-z0-9_-]{1,160}$/.test(destination.searchParams.get('page')||'') ||
           [...destination.searchParams.keys()].some(key=>!['project','page'].includes(key)) || destination.hash) {
          throw new Error('The installer returned an invalid Theme Studio destination.');
        }
        setState('opening');
        navigateApp(destination.pathname + destination.search);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Theme installation failed.');
        setState('error');
      }
    })();
  }, [attempt, isPending, user?.id, slug, version]);

  if (isPending) return <p role="status" className="p-8 text-muted-foreground">Checking your AgentSam account…</p>;
  if (!user) return <RedirectToSignIn />;

  return (
    <main className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-5" data-theme-store-direct-install>
      <section className="w-full max-w-md rounded-xl border border-border bg-card p-6" aria-label="Theme Store installation">
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Theme Store</p>
        <h1 className="text-xl font-semibold">Add {slug}</h1>
        <p className="mt-2 text-sm text-muted-foreground" role="status">
          {state === 'installing'
            ? 'Verifying the published release and creating your private Theme Studio draft. No existing site will be changed.'
            : state === 'opening'
              ? 'Your private draft is ready. Opening Theme Studio…'
              : 'The installation could not be completed. Your existing sites were not modified.'}
        </p>
        {error && (
          <p className="mt-4 rounded-md border border-destructive/40 p-3 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <div className="mt-5 flex flex-wrap gap-3">
          {state === 'error' && (
            <button type="button" className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
              onClick={() => setAttempt(value => value + 1)}>Try again</button>
          )}
          <a className="rounded-md border border-border px-4 py-2 text-sm"
            href={'https://themes.inneranimalmedia.com/themes/' + encodeURIComponent(slug) + '/'}>
            Back to theme
          </a>
        </div>
      </section>
    </main>
  );
}

/** /admin/sites is the direct install handoff; ordinary site management lives at /admin/store. */
function CanonicalSitesEntry() {
  const location = useLocation();
  const params = new URLSearchParams(location.searchStr);
  const selection = themeStoreTrySelection({
    action: params.get('action'),
    theme_sku: params.get('theme_sku'),
    theme_version: params.get('theme_version'),
  });
  if (selection) return <ThemeStoreInstallEntry selection={selection} />;
  return <Navigate to="/admin/store" search={{
    site_id: /^[A-Za-z0-9_-]{1,160}$/.test(params.get('site_id') || '')
      ? params.get('site_id')! : undefined,
    theme_sku: undefined, theme_version: undefined, action: undefined,
    view: undefined,
    stock: undefined,
  }} replace />;
}
export const Route = createFileRoute('/(apps)/admin/sites')({ component: CanonicalSitesEntry });

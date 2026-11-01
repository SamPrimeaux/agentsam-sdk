import { useEffect, useState } from 'react';
import { EmptyCredentials } from '../components/EmptyCredentials.jsx';
import { CredentialCard } from '../components/CredentialCard.jsx';
import { Badge } from '../components/Badge.jsx';

/**
 * /settings/integrations — OAuth-connected accounts (not BYOK API keys).
 *
 * @param {{
 *   connections?: Array<{
 *     id: string,
 *     provider: string,
 *     label: string,
 *     status?: string,
 *     granted_scopes?: string[],
 *     account_name?: string,
 *   }>,
 *   onConnect?: (provider: string) => void,
 *   onDisconnect?: (id: string) => void,
 * }} props
 */
export function IntegrationsPage({ connections = [], onConnect, onDisconnect }) {
  const [cfResources, setCfResources] = useState(null);
  const hasCloudflare = connections.some((c) => String(c.provider || '').toLowerCase() === 'cloudflare');

  useEffect(() => {
    if (!hasCloudflare) {
      setCfResources(null);
      return undefined;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/connections/cloudflare/resources?per_page=50', {
          credentials: 'same-origin',
          headers: { accept: 'application/json' },
        });
        const body = await res.json().catch(() => ({}));
        if (!cancelled) setCfResources(body);
      } catch (error) {
        if (!cancelled) setCfResources({ ok: false, status: 'error', error: String(error?.message || error) });
      }
    })();
    return () => { cancelled = true; };
  }, [hasCloudflare]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 20 }}>Integrations</h1>
        <p style={{ margin: '4px 0 0', opacity: 0.6, fontSize: 13 }}>
          OAuth-connected accounts. Access tokens live in the vault; this page shows grants and status.
        </p>
      </div>

      {connections.length === 0 ? (
        <EmptyCredentials
          title="No integrations connected"
          description="Connect Cloudflare, GitHub, or other OAuth providers."
          action={
            onConnect ? (
              <button type="button" onClick={() => onConnect('cloudflare')} style={{ cursor: 'pointer' }}>
                Connect Cloudflare
              </button>
            ) : null
          }
        />
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {connections.map((c) => (
            <div key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <CredentialCard
                record={{
                  id: c.id,
                  label: c.label || c.provider,
                  provider: c.provider,
                  kind: 'oauth_connection',
                  status: c.status || 'active',
                }}
                onRevoke={onDisconnect ? () => onDisconnect(c.id) : undefined}
              />
              {c.account_name ? (
                <div style={{ fontSize: 12, opacity: 0.65 }}>Account · {c.account_name}</div>
              ) : null}
              {Array.isArray(c.granted_scopes) && c.granted_scopes.length ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {c.granted_scopes.slice(0, 12).map((scope) => (
                    <Badge key={scope} tone="oauth">
                      {scope}
                    </Badge>
                  ))}
                  {c.granted_scopes.length > 12 ? (
                    <Badge tone="local">+{c.granted_scopes.length - 12}</Badge>
                  ) : null}
                </div>
              ) : null}
              {String(c.provider || '').toLowerCase() === 'cloudflare' && cfResources ? (
                <CloudflareResourceSummary resources={cfResources} onConnect={onConnect} />
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CloudflareResourceSummary({ resources, onConnect }) {
  const status = resources?.status || 'unknown';
  const buckets = Array.isArray(resources?.r2?.buckets) ? resources.r2.buckets : [];
  const missing = Array.isArray(resources?.missing_scopes) ? resources.missing_scopes : [];
  return (
    <div style={{
      display: 'grid',
      gap: 8,
      padding: 12,
      borderRadius: 10,
      border: '1px solid color-mix(in oklab, currentColor 16%, transparent)',
      fontSize: 12,
    }}>
      <div style={{ fontWeight: 600 }}>Cloudflare media discovery · {status}</div>
      <div style={{ opacity: 0.75 }}>
        Account {resources?.account?.id || '—'} · R2 buckets {buckets.length}
        {' · '}Images {resources?.images?.status || '—'}
        {' · '}Stream {resources?.stream?.status || '—'}
      </div>
      {buckets.length ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {buckets.slice(0, 12).map((bucket) => (
            <Badge key={bucket.name} tone="local">{bucket.name}</Badge>
          ))}
          {buckets.length > 12 ? <Badge tone="local">+{buckets.length - 12}</Badge> : null}
        </div>
      ) : (
        <div style={{ opacity: 0.65 }}>
          {resources?.r2?.status === 'needs_scope'
            ? 'R2 listing needs workers-r2.read — reconnect with the media pack.'
            : resources?.r2?.status === 'empty'
              ? 'No R2 buckets in this account.'
              : 'Bucket list unavailable until the connection authorizes R2.'}
        </div>
      )}
      {missing.length ? (
        <div style={{ opacity: 0.7 }}>Missing scopes: {missing.slice(0, 8).join(', ')}</div>
      ) : null}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <a href="/media" style={{ fontSize: 12 }}>Open Media Library</a>
        {onConnect ? (
          <button type="button" onClick={() => onConnect('cloudflare')} style={{ cursor: 'pointer', fontSize: 12 }}>
            Reconnect media scopes
          </button>
        ) : (
          <a href="/api/connections/cloudflare/start?packs=media&return_to=/settings/integrations" style={{ fontSize: 12 }}>
            Reconnect media scopes
          </a>
        )}
      </div>
    </div>
  );
}

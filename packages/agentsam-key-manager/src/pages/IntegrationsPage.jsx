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
 *     account_selection_required?: boolean,
 *     preferred_connection_id?: string|null,
 *     accounts?: Array<{
 *       connection_id?: string,
 *       connectionId?: string,
 *       cloudflare_account_id?: string,
 *       cloudflareAccountId?: string,
 *       account_label?: string,
 *       accountLabel?: string,
 *       preferred?: boolean,
 *     }>,
 *   }>,
 *   onConnect?: (provider: string) => void,
 *   onDisconnect?: (id: string, opts?: { accountId?: string }) => void,
 *   onSelectAccount?: (provider: string, accountId: string) => void | Promise<void>,
 * }} props
 */
export function IntegrationsPage({
  connections = [],
  onConnect,
  onDisconnect,
  onSelectAccount,
}) {
  const [cfResources, setCfResources] = useState(null);
  const [selectBusy, setSelectBusy] = useState('');
  const [selectError, setSelectError] = useState('');
  const hasCloudflare = connections.some((c) => String(c.provider || '').toLowerCase() === 'cloudflare');
  const preferredCf = connections.find((c) => String(c.provider || '').toLowerCase() === 'cloudflare');
  const preferredAccountId = preferredCf?.preferred_connection_id
    || preferredCf?.accounts?.find((a) => a.preferred)?.connection_id
    || preferredCf?.accounts?.find((a) => a.preferred)?.connectionId
    || '';

  useEffect(() => {
    if (!hasCloudflare) {
      setCfResources(null);
      return undefined;
    }
    let cancelled = false;
    void (async () => {
      try {
        const qs = new URLSearchParams({ per_page: '50' });
        if (preferredAccountId) qs.set('connection_id', preferredAccountId);
        const res = await fetch(`/api/connections/cloudflare/resources?${qs}`, {
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
  }, [hasCloudflare, preferredAccountId]);

  async function handleSelect(provider, accountId) {
    if (!onSelectAccount || !accountId) return;
    setSelectBusy(accountId);
    setSelectError('');
    try {
      await onSelectAccount(provider, accountId);
    } catch (error) {
      setSelectError(String(error?.message || error || 'account_selection_failed'));
    } finally {
      setSelectBusy('');
    }
  }

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
                <div style={{ fontSize: 12, opacity: 0.65 }}>
                  Active account · {c.account_name}
                  {c.preferred_connection_id ? ` · ${c.preferred_connection_id}` : ''}
                </div>
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
              {String(c.provider || '').toLowerCase() === 'cloudflare' ? (
                <CloudflareAccountPicker
                  connection={c}
                  selectBusy={selectBusy}
                  selectError={selectError}
                  onSelect={(accountId) => void handleSelect('cloudflare', accountId)}
                  onConnect={onConnect}
                  onDisconnect={onDisconnect}
                />
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

function accountIdOf(account) {
  return String(
    account?.connection_id
      || account?.connectionId
      || account?.cloudflare_account_id
      || account?.cloudflareAccountId
      || '',
  ).trim();
}

function accountLabelOf(account) {
  return String(
    account?.account_label
      || account?.accountLabel
      || account?.name
      || accountIdOf(account)
      || 'Cloudflare account',
  ).trim();
}

function CloudflareAccountPicker({
  connection,
  selectBusy,
  selectError,
  onSelect,
  onConnect,
  onDisconnect,
}) {
  const accounts = Array.isArray(connection?.accounts) ? connection.accounts : [];
  const needsSelection = Boolean(connection?.account_selection_required) || accounts.length > 1;
  if (!needsSelection && accounts.length <= 1) return null;

  return (
    <div style={{
      display: 'grid',
      gap: 10,
      padding: 12,
      borderRadius: 10,
      border: '1px solid color-mix(in oklab, currentColor 16%, transparent)',
      fontSize: 12,
    }}>
      <div style={{ fontWeight: 600 }}>
        Cloudflare accounts
        {connection?.account_selection_required ? ' · selection required' : ''}
      </div>
      <p style={{ margin: 0, opacity: 0.7, lineHeight: 1.45 }}>
        One OAuth grant can authorize multiple Cloudflare accounts. Choose which account AgentSam should use for D1, R2, Images, Stream, and Workers. The selection persists across refresh and reconnect.
      </p>
      {selectError ? (
        <div style={{ color: 'crimson' }}>{selectError}</div>
      ) : null}
      <div style={{ display: 'grid', gap: 8 }}>
        {accounts.map((account) => {
          const id = accountIdOf(account);
          const preferred = Boolean(account.preferred) || connection?.preferred_connection_id === id;
          return (
            <div
              key={id || accountLabelOf(account)}
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                padding: '8px 10px',
                borderRadius: 8,
                border: preferred
                  ? '1px solid color-mix(in oklab, #0a7 45%, transparent)'
                  : '1px solid color-mix(in oklab, currentColor 12%, transparent)',
                background: preferred
                  ? 'color-mix(in oklab, #0a7 8%, transparent)'
                  : 'transparent',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{accountLabelOf(account)}</div>
                <div style={{ opacity: 0.65, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                  {id || 'unknown account id'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {preferred ? <Badge tone="oauth">Selected</Badge> : null}
                {!preferred && onSelect ? (
                  <button
                    type="button"
                    disabled={Boolean(selectBusy)}
                    onClick={() => onSelect(id)}
                    style={{ cursor: selectBusy ? 'wait' : 'pointer', fontSize: 12 }}
                  >
                    {selectBusy === id ? 'Saving…' : 'Use this account'}
                  </button>
                ) : null}
                {onDisconnect ? (
                  <button
                    type="button"
                    onClick={() => onDisconnect(connection.id, { accountId: id })}
                    style={{ cursor: 'pointer', fontSize: 12 }}
                  >
                    Disconnect
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {onConnect ? (
          <button type="button" onClick={() => onConnect('cloudflare')} style={{ cursor: 'pointer', fontSize: 12 }}>
            Reconnect / reauthorize
          </button>
        ) : (
          <a href="/api/connections/cloudflare/start?packs=media,data&return_to=/settings/integrations" style={{ fontSize: 12 }}>
            Reconnect / reauthorize
          </a>
        )}
      </div>
    </div>
  );
}

function CloudflareResourceSummary({ resources, onConnect }) {
  const status = resources?.status || 'unknown';
  const buckets = Array.isArray(resources?.r2?.buckets) ? resources.r2.buckets : [];
  const missing = Array.isArray(resources?.missing_scopes) ? resources.missing_scopes : [];
  const accounts = Array.isArray(resources?.accounts) ? resources.accounts : [];
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
      {resources?.error === 'cloudflare_account_selection_required' || accounts.length > 1 ? (
        <div style={{ opacity: 0.75 }}>
          Multiple Cloudflare accounts are authorized. Select an account above before browsing resources.
        </div>
      ) : null}
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

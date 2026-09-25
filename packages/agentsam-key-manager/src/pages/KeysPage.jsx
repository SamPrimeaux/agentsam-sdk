import { useEffect, useState } from 'react';
import { EmptyCredentials } from '../components/EmptyCredentials.jsx';
import { CredentialCard } from '../components/CredentialCard.jsx';
import { CredentialDialog } from '../components/CredentialDialog.jsx';

/**
 * /settings/keys — BYOK provider credentials + AgentSam API keys.
 * Talks to host vault API; does not encrypt in the browser.
 *
 * @param {{
 *   providers: Array<object>,
 *   listUrl?: string,
 *   createUrl?: string,
 *   mapSecret?: (row: any) => object,
 * }} props
 */
export function KeysPage({
  providers,
  listUrl = '/api/vault/secrets',
  createUrl = '/api/vault/secrets',
  mapSecret,
}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [adding, setAdding] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(listUrl, { credentials: 'same-origin' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `load_failed_${res.status}`);
      const secrets = Array.isArray(data.secrets) ? data.secrets : [];
      setRows(
        secrets.map((s) =>
          mapSecret
            ? mapSecret(s)
            : {
                id: s.id,
                label: s.name || s.service,
                provider: s.service,
                kind: 'provider_api_key',
                status: 'active',
                last4: s.last4,
                last_used_at: s.last_used_at,
              },
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [listUrl]);

  async function onSubmit({ provider, label, values }) {
    const value = values.api_key || Object.values(values)[0];
    const res = await fetch(createUrl, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        service_name: provider,
        secret_name: label,
        value,
        secret_type: 'api_key',
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `save_failed_${res.status}`);
    setAdding(false);
    await load();
  }

  async function onRevoke(id) {
    const res = await fetch(`${listUrl.replace(/\/$/, '')}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'same-origin',
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `revoke_failed_${res.status}`);
    }
    await load();
  }

  const byokProviders = (providers || []).filter((p) => p.credential?.kind !== 'oauth_connection');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20 }}>Keys</h1>
          <p style={{ margin: '4px 0 0', opacity: 0.6, fontSize: 13 }}>
            BYOK provider credentials and AgentSam API keys. Secrets stay in the vault.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'rgba(59,130,246,0.25)',
            color: 'inherit',
            cursor: 'pointer',
          }}
        >
          {adding ? 'Close' : 'Add credential'}
        </button>
      </div>

      {adding ? (
        <div style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: 16 }}>
          <CredentialDialog providers={byokProviders} onSubmit={onSubmit} onCancel={() => setAdding(false)} />
        </div>
      ) : null}

      {loading ? <div style={{ opacity: 0.6 }}>Loading…</div> : null}
      {error ? <div style={{ color: '#f87171' }}>{error}</div> : null}
      {!loading && !error && rows.length === 0 ? (
        <EmptyCredentials action={
          <button type="button" onClick={() => setAdding(true)} style={{ cursor: 'pointer' }}>
            Add credential
          </button>
        } />
      ) : null}
      <div style={{ display: 'grid', gap: 12 }}>
        {rows.map((row) => (
          <CredentialCard key={row.id} record={row} onRevoke={() => onRevoke(row.id)} />
        ))}
      </div>
    </div>
  );
}

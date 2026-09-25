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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

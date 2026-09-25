import { Badge } from './Badge.jsx';
import { InlineCopyText } from './InlineCopyText.jsx';

/**
 * Metadata-only credential card — never shows full secret after save.
 *
 * @param {{
 *   record: {
 *     id: string,
 *     label: string,
 *     provider?: string,
 *     kind?: string,
 *     status?: string,
 *     last4?: string|null,
 *     last_used_at?: string|null,
 *     validated_at?: string|null,
 *   },
 *   onTest?: () => void,
 *   onRevoke?: () => void,
 *   onReplace?: () => void,
 * }} props
 */
export function CredentialCard({ record, onTest, onRevoke, onReplace }) {
  const status = record.status || 'active';
  const isOauth = record.kind === 'oauth_connection';
  return (
    <div
      style={{
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 14,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        background: 'rgba(255,255,255,0.02)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontWeight: 650 }}>{record.label || record.provider}</div>
          <div style={{ fontSize: 12, opacity: 0.55, marginTop: 2 }}>
            {record.provider || record.kind}
            {record.last4 ? ` · ••••${record.last4}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <Badge tone={status}>{status}</Badge>
          <Badge tone={isOauth ? 'oauth' : 'byok'}>{isOauth ? 'OAuth' : 'BYOK'}</Badge>
        </div>
      </div>
      <InlineCopyText value={record.id} label="id" />
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        {onTest ? (
          <button type="button" onClick={onTest} style={btnStyle}>
            Test
          </button>
        ) : null}
        {onReplace ? (
          <button type="button" onClick={onReplace} style={btnStyle}>
            Replace
          </button>
        ) : null}
        {onRevoke ? (
          <button type="button" onClick={onRevoke} style={{ ...btnStyle, color: '#f87171' }}>
            Revoke
          </button>
        ) : null}
      </div>
    </div>
  );
}

const btnStyle = {
  fontSize: 12,
  padding: '6px 10px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.12)',
  background: 'rgba(255,255,255,0.04)',
  color: 'inherit',
  cursor: 'pointer',
};

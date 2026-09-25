import { useMemo, useState } from 'react';
import { SensitiveInput } from './SensitiveInput.jsx';

/**
 * Renders fields from a credential provider definition (no hardcoded forms).
 *
 * @param {{
 *   providers: Array<{ id: string, label: string, fields: Array<{ id: string, type: string, label?: string, required?: boolean }> }>,
 *   onSubmit: (payload: { provider: string, label: string, values: Record<string,string> }) => Promise<void>|void,
 *   onCancel?: () => void,
 * }} props
 */
export function CredentialDialog({ providers, onSubmit, onCancel }) {
  const list = providers || [];
  const [providerId, setProviderId] = useState(list[0]?.id || '');
  const provider = useMemo(() => list.find((p) => p.id === providerId) || list[0], [list, providerId]);
  const [label, setLabel] = useState('');
  const [values, setValues] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    if (!provider) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        provider: provider.id,
        label: label || provider.label,
        values,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 420 }}>
      <div>
        <label style={labelStyle}>Provider</label>
        <select
          value={provider?.id || ''}
          onChange={(e) => {
            setProviderId(e.target.value);
            setValues({});
          }}
          style={inputStyle}
        >
          {list.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label style={labelStyle}>Label</label>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={provider?.label || 'Production'}
          style={inputStyle}
        />
      </div>
      {(provider?.fields || []).map((field) =>
        field.type === 'secret' ? (
          <SensitiveInput
            key={field.id}
            label={field.label || field.id}
            value={values[field.id] || ''}
            onChange={(v) => setValues((prev) => ({ ...prev, [field.id]: v }))}
            required={field.required}
            variant={error && !values[field.id] ? 'error' : 'default'}
            error={error && !values[field.id] ? error : undefined}
            description={field.type === 'secret' ? 'Keep this value secure and don’t share it' : undefined}
          />
        ) : (
          <div key={field.id}>
            <label style={labelStyle}>{field.label || field.id}</label>
            <input
              value={values[field.id] || ''}
              onChange={(e) => setValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
              style={inputStyle}
            />
          </div>
        ),
      )}
      {error ? <div style={{ color: '#f87171', fontSize: 12 }}>{error}</div> : null}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        {onCancel ? (
          <button type="button" onClick={onCancel} style={btnStyle}>
            Cancel
          </button>
        ) : null}
        <button type="submit" disabled={busy} style={{ ...btnStyle, background: 'rgba(59,130,246,0.25)' }}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}

const labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, opacity: 0.8 };
const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid rgba(255,255,255,0.12)',
  background: 'rgba(0,0,0,0.35)',
  color: 'inherit',
};
const btnStyle = {
  fontSize: 12,
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.12)',
  background: 'rgba(255,255,255,0.04)',
  color: 'inherit',
  cursor: 'pointer',
};

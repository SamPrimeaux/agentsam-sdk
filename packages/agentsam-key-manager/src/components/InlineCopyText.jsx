/**
 * Non-secret copyable text (IDs, fingerprints, refs).
 * @param {{ value: string, label?: string }} props
 */
export function InlineCopyText({ value, label }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      /* ignore */
    }
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }}>
      {label ? <span style={{ opacity: 0.55 }}>{label}</span> : null}
      <code style={{ opacity: 0.9 }}>{value}</code>
      <button type="button" onClick={copy} style={{ fontSize: 11, color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer' }}>
        Copy
      </button>
    </span>
  );
}

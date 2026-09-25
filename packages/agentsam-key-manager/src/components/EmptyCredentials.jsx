/**
 * @param {{ title?: string, description?: string, action?: import('react').ReactNode }} props
 */
export function EmptyCredentials({
  title = 'No credentials yet',
  description = 'Add a provider API key or connect an integration to get started.',
  action = null,
}) {
  return (
    <div
      style={{
        border: '1px dashed rgba(255,255,255,0.14)',
        borderRadius: 14,
        padding: '28px 20px',
        textAlign: 'center',
        opacity: 0.9,
      }}
    >
      <div style={{ fontWeight: 650, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13, opacity: 0.65, marginBottom: action ? 16 : 0 }}>{description}</div>
      {action}
    </div>
  );
}

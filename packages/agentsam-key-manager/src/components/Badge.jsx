const TONE = {
  active: { bg: 'rgba(16,185,129,0.15)', fg: '#34d399' },
  expired: { bg: 'rgba(245,158,11,0.15)', fg: '#fbbf24' },
  revoked: { bg: 'rgba(239,68,68,0.15)', fg: '#f87171' },
  invalid: { bg: 'rgba(239,68,68,0.15)', fg: '#f87171' },
  oauth: { bg: 'rgba(59,130,246,0.15)', fg: '#60a5fa' },
  byok: { bg: 'rgba(168,85,247,0.15)', fg: '#c084fc' },
  local: { bg: 'rgba(148,163,184,0.15)', fg: '#cbd5e1' },
  hosted: { bg: 'rgba(20,184,166,0.15)', fg: '#2dd4bf' },
};

/**
 * @param {{ children: import('react').ReactNode, tone?: keyof typeof TONE }} props
 */
export function Badge({ children, tone = 'active' }) {
  const t = TONE[tone] || TONE.active;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 650,
        background: t.bg,
        color: t.fg,
      }}
    >
      {children}
    </span>
  );
}

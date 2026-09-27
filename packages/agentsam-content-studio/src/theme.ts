import type { CSSProperties } from "react";

/** Inline-style design tokens so the package ships zero CSS dependencies. */
export const tokens = {
  bg: "#0e1015",
  panel: "#161922",
  panelAlt: "#1c202b",
  border: "#2a2f3d",
  text: "#e8eaf0",
  textDim: "#8b91a3",
  accent: "#5b8cff",
  good: "#3ecf8e",
  warn: "#f5b83d",
  bad: "#f0565f",
  radius: 10,
  font: "system-ui, -apple-system, 'Segoe UI', sans-serif",
};

export const styles = {
  shell: {
    display: "flex",
    height: "100%",
    minHeight: 0,
    background: tokens.bg,
    color: tokens.text,
    fontFamily: tokens.font,
    fontSize: 14,
  },
  panel: {
    background: tokens.panel,
    border: `1px solid ${tokens.border}`,
    borderRadius: tokens.radius,
  },
  sectionTitle: {
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: tokens.textDim,
    margin: "16px 0 6px",
  },
  kvRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    padding: "4px 0",
    borderBottom: `1px solid ${tokens.border}22`,
  },
  chip: {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 999,
    background: tokens.panelAlt,
    border: `1px solid ${tokens.border}`,
    color: tokens.textDim,
    fontSize: 12,
    marginRight: 6,
    marginBottom: 6,
  },
  button: {
    padding: "6px 12px",
    borderRadius: 8,
    border: `1px solid ${tokens.border}`,
    background: tokens.panelAlt,
    color: tokens.text,
    cursor: "pointer",
    fontSize: 13,
  },
} satisfies Record<string, CSSProperties>;

export function stateColor(state: string): string {
  switch (state) {
    case "live":
      return tokens.good;
    case "approved":
      return tokens.accent;
    case "review":
      return tokens.warn;
    case "rejected":
    case "superseded":
      return tokens.bad;
    default:
      return tokens.textDim;
  }
}

export function fmtBytes(n?: number): string {
  if (n === undefined) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function fmtDuration(ms?: number): string {
  if (ms === undefined) return "—";
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}:${String(s % 60).padStart(2, "0")}` : `${s}s`;
}

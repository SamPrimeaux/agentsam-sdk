import type { ReactNode } from "react";
import { styles, tokens } from "../theme.js";

export function Section(props: { title: string; children: ReactNode }) {
  return (
    <div>
      <div style={styles.sectionTitle}>{props.title}</div>
      {props.children}
    </div>
  );
}

export function KV(props: { label: string; value?: ReactNode }) {
  return (
    <div style={styles.kvRow}>
      <span style={{ color: tokens.textDim }}>{props.label}</span>
      <span style={{ textAlign: "right", wordBreak: "break-all" }}>{props.value ?? "—"}</span>
    </div>
  );
}

export function Chips(props: { items: string[] }) {
  if (props.items.length === 0) return <span style={{ color: tokens.textDim }}>none</span>;
  return (
    <div>
      {props.items.map((t) => (
        <span key={t} style={styles.chip}>
          {t}
        </span>
      ))}
    </div>
  );
}

export function NumberField(props: {
  label: string;
  value: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "3px 0" }}>
      <span style={{ color: tokens.textDim, fontSize: 12 }}>{props.label}</span>
      <input
        type="number"
        value={props.value}
        step={props.step ?? 0.1}
        onChange={(e) => props.onChange(Number(e.target.value))}
        style={{
          width: 90,
          padding: "4px 6px",
          borderRadius: 6,
          border: `1px solid ${tokens.border}`,
          background: tokens.panelAlt,
          color: tokens.text,
        }}
      />
    </label>
  );
}

export function TextField(props: {
  label: string;
  value: string;
  placeholder?: string;
  onCommit: (v: string) => void;
}) {
  return (
    <label style={{ display: "block", padding: "4px 0" }}>
      <div style={{ color: tokens.textDim, fontSize: 12, marginBottom: 3 }}>{props.label}</div>
      <input
        defaultValue={props.value}
        placeholder={props.placeholder}
        onBlur={(e) => {
          if (e.target.value !== props.value) props.onCommit(e.target.value);
        }}
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "6px 8px",
          borderRadius: 6,
          border: `1px solid ${tokens.border}`,
          background: tokens.panelAlt,
          color: tokens.text,
        }}
      />
    </label>
  );
}

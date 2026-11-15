import { useId, useMemo, useState, type CSSProperties } from "react";
import type { SettingsTheme, SettingsThemeSpec } from "../contracts";

/**
 * Design spec sheet. Brand-flexible by construction:
 *   - COLORS come from any theme's tokens/cssVars (resolved by semantic role).
 *   - STRUCTURE (type scale, radii, spacing, component rules) comes from a theme
 *     that defines a spec (cms_themes typography/layout/components JSON).
 * Pick any pair to see one brand's palette on another's structure. Every value
 * shown is read from the selected rows; nothing is a brand constant.
 */

type Role =
  | "page" | "card" | "input" | "line" | "lineStrong" | "ink" | "muted" | "faint"
  | "primary" | "onPrimary" | "accentText" | "accentTint" | "accentLine";

const ROLE_CANDIDATES: Record<Role, string[]> = {
  page: ["--color-background", "--bg-canvas", "--bg-app", "--color-background-primary"],
  card: ["--color-card", "--bg-elevated", "--bg-panel", "--color-surface", "--bg-surface"],
  input: ["--bg-input", "--color-secondary", "--bg-secondary", "--color-background-secondary"],
  line: ["--color-border", "--border-subtle", "--border"],
  lineStrong: ["--border-strong", "--color-input", "--color-border"],
  ink: ["--color-foreground", "--text-primary", "--color-text", "--color-text-primary"],
  muted: ["--color-muted-foreground", "--text-secondary", "--text-muted", "--color-text-secondary"],
  faint: ["--text-faint", "--color-text-tertiary", "--text-muted"],
  primary: ["--color-primary", "--accent-primary", "--accent", "--color-accent"],
  onPrimary: ["--color-primary-foreground", "--text-on-accent", "--color-accent-text"],
  accentText: ["--accent-text", "--color-ring", "--accent-secondary", "--color-accent-hover", "--accent"],
  accentTint: ["--accent-tint", "--color-accent", "--bg-secondary"],
  accentLine: ["--accent-line", "--color-ring", "--color-border"],
};

const DEFAULT_SWATCHES: Array<[string, Role, string]> = [
  ["Ink", "ink", "text"], ["Page", "page", "page background"], ["Card", "card", "cards, panels"],
  ["Input", "input", "fields"], ["Line", "line", "hairlines"], ["Line strong", "lineStrong", "field borders"],
  ["Muted", "muted", "secondary text"], ["Faint", "faint", "hints"], ["Primary", "primary", "primary action"],
  ["Accent text", "accentText", "links, focus"], ["Accent tint", "accentTint", "selected fill"],
  ["Accent line", "accentLine", "selected border"],
];

function resolveRole(theme: SettingsTheme | undefined, role: Role): string | null {
  const tokens = theme?.spec?.tokens || {};
  if (typeof tokens[role] === "string") return tokens[role];
  const vars = theme?.cssVars || {};
  for (const name of ROLE_CANDIDATES[role]) {
    const value = vars[name];
    if (typeof value === "string" && value && !value.startsWith("var(")) return value;
  }
  return null;
}

function paletteFor(theme: SettingsTheme | undefined) {
  const out = {} as Record<Role, string | null>;
  for (const role of Object.keys(ROLE_CANDIDATES) as Role[]) out[role] = resolveRole(theme, role);
  return out;
}

/** WCAG relative-luminance contrast for #rgb/#rrggbb pairs; null when not computable. */
function contrast(a: string | null, b: string | null) {
  const lum = (hex: string | null) => {
    const m = hex && /^#([\da-f]{3}|[\da-f]{6})$/i.exec(hex.trim());
    if (!m) return null;
    const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
    const [r, g, b2] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b2;
  };
  const la = lum(a), lb = lum(b);
  if (la === null || lb === null) return null;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function hasStructure(theme: SettingsTheme) {
  const spec = theme.spec;
  return Boolean(spec?.typography?.scale?.length || spec?.layout?.radii?.length);
}

function Heading({ children }: { children: string }) {
  return (
    <div className="pb-3 text-[15px] font-semibold leading-[22px]"
      style={{ borderBottom: "1px solid var(--spec-accentText)" }}>{children}</div>
  );
}

function ThemePicker({ label, themes, value, onChange }: {
  label: string; themes: SettingsTheme[]; value: string; onChange: (id: string) => void;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex min-w-[180px] flex-1 flex-col gap-1.5">
      <span className="text-[11px] font-medium">{label}</span>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-lg border border-border bg-background px-2 text-[12px] text-foreground">
        {themes.map((t) => <option key={t.id} value={t.id}>{t.name}{t.active ? " (active)" : ""}</option>)}
      </select>
    </label>
  );
}

export function SettingsDesignSpecSheet({ themes, onOpenThemes }: {
  themes: SettingsTheme[]; onOpenThemes?: () => void;
}) {
  const usable = useMemo(() => themes.filter((t) => t.status !== "archived" && Object.keys(t.cssVars || {}).length), [themes]);
  const structured = useMemo(() => usable.filter(hasStructure), [usable]);
  const active = usable.find((t) => t.active);
  const [colorsId, setColorsId] = useState(() => (structured[0] || active || usable[0])?.id || "");
  const [structureId, setStructureId] = useState(() => structured[0]?.id || "");
  const colors = usable.find((t) => t.id === colorsId) || usable[0];
  const structure = structured.find((t) => t.id === structureId) || structured[0];

  if (!usable.length) {
    return <p className="rounded-xl border border-border/70 p-4 text-[11px] text-muted-foreground">
      No themes with color tokens are available to this account yet.
    </p>;
  }

  const palette = paletteFor(colors);
  const spec: SettingsThemeSpec = structure?.spec || {};
  const scale = spec.typography?.scale || [];
  const radii = spec.layout?.radii || [];
  const spacing = spec.layout?.spacing || [];
  const swatches = (spec.components?.swatches as Array<[string, string, string]> | undefined)?.length
    ? (spec.components!.swatches as Array<[string, Role, string]>)
    : DEFAULT_SWATCHES;
  const family = spec.typography?.family;
  const vars = Object.fromEntries(
    (Object.entries(palette) as Array<[Role, string | null]>).map(([role, v]) => [`--spec-${role}`, v || "transparent"]),
  ) as CSSProperties;
  const inkOnPage = contrast(palette.ink, palette.page);
  const mutedOnCard = contrast(palette.muted, palette.card);
  const onPrimary = contrast(palette.onPrimary, palette.primary);
  const missing = (Object.entries(palette) as Array<[Role, string | null]>).filter(([, v]) => !v).map(([r]) => r);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <ThemePicker label="Colors from" themes={usable} value={colors?.id || ""} onChange={setColorsId}/>
        {structured.length > 0 && (
          <ThemePicker label="Structure from" themes={structured} value={structure?.id || ""} onChange={setStructureId}/>
        )}
        {onOpenThemes && <button type="button" onClick={onOpenThemes}
          className="h-9 rounded-lg border border-border px-3 text-[12px] hover:bg-muted">Manage themes →</button>}
      </div>
      {missing.length > 0 && (
        <p className="text-[11px]" style={{ color: "var(--settings-warning-ink)" }}>
          {colors?.name} doesn't define: {missing.join(", ")}. Those samples show as empty.
        </p>
      )}

      <div data-spec-sheet={colors?.slug || colors?.id} className="overflow-hidden rounded-2xl border border-border"
        style={{ ...vars, background: "var(--spec-card)", color: "var(--spec-ink)",
          fontFamily: family ? `'${family}', ui-sans-serif, system-ui, sans-serif` : undefined }}>
        <div className="mx-auto flex max-w-[1200px] flex-col gap-12 px-4 py-8 sm:px-10 sm:py-12">
          <div className="flex flex-col gap-2">
            <h3 className="m-0 text-[28px] font-medium leading-9 tracking-[-0.02em] sm:text-[32px] sm:leading-10">{colors?.name}</h3>
            <p className="m-0 max-w-[720px] text-[15px] leading-6" style={{ color: "var(--spec-muted)" }}>
              {String(colors?.spec?.brand?.description || structure?.spec?.brand?.description || "Color tokens resolved from this theme, shown on the selected structure.")}
            </p>
            <p className="m-0 text-[12px]" style={{ color: "var(--spec-faint)" }}>
              Contrast: ink on page {inkOnPage ? inkOnPage.toFixed(1) : "—"}:1 · muted on card {mutedOnCard ? mutedOnCard.toFixed(1) : "—"}:1 · text on primary {onPrimary ? onPrimary.toFixed(1) : "—"}:1
              {onPrimary !== null && onPrimary < 4.5 ? " (below AA for body text)" : ""}
            </p>
          </div>

          <section className="flex flex-col gap-5">
            <Heading>Color tokens</Heading>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {swatches.map(([name, role, use]) => (
                <div key={name} className="flex flex-col gap-2">
                  <div className="h-16 rounded-xl" style={{ background: palette[role] || "transparent", border: "1px solid var(--spec-lineStrong)" }}/>
                  <div className="text-[13px] font-medium leading-[18px]">{name}</div>
                  <div className="text-[12px] leading-4" style={{ color: "var(--spec-muted)" }}>{palette[role] || "not set"} · {use}</div>
                </div>
              ))}
            </div>
          </section>

          {scale.length > 0 && (
            <section className="flex flex-col">
              <div className="mb-3"><Heading>{`Type scale${family ? ` · ${family}` : ""} · size / line-height`}</Heading></div>
              {scale.map((row) => (
                <div key={row.role} className="grid items-baseline gap-x-6 gap-y-2 py-2.5 sm:grid-cols-[160px_minmax(0,1fr)_220px]"
                  style={{ borderBottom: "1px solid var(--spec-line)" }}>
                  <div className="text-[13px]" style={{ color: "var(--spec-muted)" }}>{row.label}</div>
                  <div className="min-w-0 break-words" style={{
                    fontSize: `clamp(${Math.min(row.size, 22)}px, ${row.size / 14}vw, ${row.size}px)`,
                    lineHeight: `${row.line / row.size}`, fontWeight: row.weight,
                    letterSpacing: row.tracking, color: row.tone === "muted" ? "var(--spec-muted)" : undefined,
                  }}>{row.sample}</div>
                  <div className="text-[12px]" style={{ color: "var(--spec-muted)" }}>
                    {row.size}/{row.line} · {row.weight}{row.tracking ? ` · ${row.tracking}` : ""}{row.note ? ` · ${row.note}` : ""}
                  </div>
                </div>
              ))}
            </section>
          )}

          {radii.length > 0 && (
            <section className="flex flex-col gap-5">
              <Heading>Shape and spacing</Heading>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {radii.map((r) => (
                  <div key={r.label} className="flex flex-col gap-2">
                    <div className="h-[72px]" style={{ border: "1px solid var(--spec-accentText)", borderRadius: r.value }}/>
                    <div className="text-[13px] font-medium">{r.label} · {r.value}</div>
                    {r.note && <div className="text-[12px]" style={{ color: "var(--spec-muted)" }}>{r.note}</div>}
                  </div>
                ))}
              </div>
              {spacing.length > 0 && (
                <div className="flex flex-wrap items-end gap-3">
                  {spacing.map((step) => (
                    <div key={step} className="flex flex-col items-center gap-1">
                      <div style={{ width: step, height: step, background: "var(--spec-accentTint)", border: "1px solid var(--spec-accentLine)" }}/>
                      <span className="text-[11px]" style={{ color: "var(--spec-muted)" }}>{step}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          <section className="flex flex-col gap-5">
            <Heading>Components</Heading>
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-3">
                  {[
                    ["Primary", { background: "var(--spec-primary)", color: "var(--spec-onPrimary)" }],
                    ["Outline", { background: "var(--spec-card)", border: "1px solid var(--spec-accentText)" }],
                    ["Quiet", { background: "var(--spec-input)" }],
                  ].map(([label, style]) => (
                    <button key={label as string} type="button"
                      className="inline-flex h-11 items-center justify-center rounded-full px-6 text-[14px] font-medium"
                      style={{ color: "var(--spec-ink)", ...(style as CSSProperties) }}>{label as string}</button>
                  ))}
                </div>
                <div className="text-[13px] font-medium">Pill button</div>
                <div className="text-[12px] leading-[18px]" style={{ color: "var(--spec-muted)" }}>
                  {String((spec.components?.button as { rule?: string } | undefined)?.rule || "One primary per screen region.")}
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex flex-col overflow-hidden rounded-xl" style={{ border: "1px solid var(--spec-lineStrong)", background: "var(--spec-card)" }}>
                  <label className="flex h-14 flex-col justify-center gap-0.5 px-4">
                    <span className="text-[12px] leading-4" style={{ color: "var(--spec-muted)" }}>Email address</span>
                    <input type="email" placeholder="you@company.com" className="bg-transparent text-[15px] leading-5 outline-none"
                      style={{ color: "var(--spec-ink)" }}/>
                  </label>
                  <div className="flex" style={{ borderTop: "1px solid var(--spec-lineStrong)" }}>
                    <label className="flex h-14 flex-1 flex-col justify-center gap-0.5 px-4" style={{ borderRight: "1px solid var(--spec-lineStrong)" }}>
                      <span className="text-[12px] leading-4" style={{ color: "var(--spec-muted)" }}>Display name</span>
                      <input placeholder="Your name" className="w-full bg-transparent text-[15px] leading-5 outline-none" style={{ color: "var(--spec-ink)" }}/>
                    </label>
                    <label className="flex h-14 flex-1 flex-col justify-center gap-0.5 px-4">
                      <span className="text-[12px] leading-4" style={{ color: "var(--spec-muted)" }}>Time zone</span>
                      <input placeholder="Region/City" className="w-full bg-transparent text-[15px] leading-5 outline-none" style={{ color: "var(--spec-ink)" }}/>
                    </label>
                  </div>
                </div>
                <div className="text-[13px] font-medium">Grouped field</div>
                <div className="text-[12px] leading-[18px]" style={{ color: "var(--spec-muted)" }}>
                  {String((spec.components?.groupedField as { rule?: string } | undefined)?.rule || "Label above value inside one bordered shell.")}
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex flex-col" style={{ borderTop: "1px solid var(--spec-accentText)" }}>
                  {[["Workspaces", "1", "3"], ["Backup codes", true, true], ["Custom domain", false, true]].map(([label, a, b]) => (
                    <div key={label as string} className="grid min-h-[52px] items-center text-[14px]"
                      style={{ gridTemplateColumns: "minmax(0,1.6fr) repeat(2,minmax(0,1fr))", borderBottom: "1px solid var(--spec-line)" }}>
                      <div>{label as string}</div>
                      {[a, b].map((cell, i) => (
                        <div key={i} className="flex justify-center">
                          {typeof cell === "string" ? cell : cell
                            ? <svg width="22" height="22" viewBox="0 0 22 22" role="img" aria-label="Included">
                                <circle cx="11" cy="11" r="11" fill="var(--spec-primary)"/>
                                <path d="M6.5 11.4l3 3 6-6.4" fill="none" stroke="var(--spec-onPrimary)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            : <span aria-label="Not included" style={{ color: "var(--spec-faint)" }}>—</span>}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
                <div className="text-[13px] font-medium">Compare row</div>
                <div className="text-[12px] leading-[18px]" style={{ color: "var(--spec-muted)" }}>
                  Min height 52, first column 1.6fr then equal columns.
                </div>
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-5">
            <Heading>In context · sign-in card</Heading>
            <div className="mx-auto w-full max-w-[400px] rounded-[20px] p-6"
              style={{ background: "var(--spec-page)", border: "1px solid var(--spec-line)" }}>
              <div className="text-[24px] font-medium leading-8 tracking-[-0.01em]">Welcome back</div>
              <p className="mb-5 mt-1 text-[14px]" style={{ color: "var(--spec-muted)" }}>Sign in to your portal.</p>
              <div className="mb-3 flex h-14 flex-col justify-center rounded-xl px-4" style={{ border: "1px solid var(--spec-lineStrong)", background: "var(--spec-input)" }}>
                <span className="text-[12px]" style={{ color: "var(--spec-muted)" }}>Email</span>
                <span className="text-[15px]" style={{ color: "var(--spec-faint)" }}>you@company.com</span>
              </div>
              <div className="mb-5 flex h-14 flex-col justify-center rounded-xl px-4" style={{ border: "1px solid var(--spec-accentLine)", background: "var(--spec-accentTint)" }}>
                <span className="text-[12px]" style={{ color: "var(--spec-accentText)" }}>Password · focused</span>
                <span className="text-[15px]">••••••••••</span>
              </div>
              <div className="flex h-12 items-center justify-center rounded-full text-[14px] font-medium"
                style={{ background: "var(--spec-primary)", color: "var(--spec-onPrimary)" }}>Sign in</div>
              <p className="mt-4 text-center text-[13px]" style={{ color: "var(--spec-muted)" }}>
                Lost access? <span style={{ color: "var(--spec-accentText)" }}>Use a backup code</span>
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

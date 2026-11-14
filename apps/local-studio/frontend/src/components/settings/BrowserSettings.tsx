import { useCallback, useEffect, useState } from "react";
import { LoaderCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconAction } from "@/components/ui/icon-action";
import {
  browserTrustMessage, loadBrowserSettings, trustBrowserOrigin, untrustBrowserOrigin,
  type EmbedRule, type TrustScope, type TrustedOrigin,
} from "@/lib/browser-trust";

const SCOPE_LABELS: Record<TrustScope, string> = { persistent: "Always", session: "This session", debug: "While debugging" };
const MODE_LABELS: Record<string, string> = { passive: "Shown embedded", browser_run: "Opened in a remote browser" };

/** Account-owned Browser controls: which websites the browser may open without asking, and the platform's embedding rules. */
export function BrowserSettings() {
  const [trusted, setTrusted] = useState<TrustedOrigin[]>([]);
  const [rules, setRules] = useState<EmbedRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  const [scope, setScope] = useState<TrustScope>("persistent");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await loadBrowserSettings();
      setTrusted(next.trusted); setRules(next.rules); setError("");
    } catch { setError("Couldn’t load your browser settings."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const change = async (key: string, action: () => Promise<void>) => {
    setBusy(key); setError("");
    try { await action(); await refresh(); }
    catch (caught) { setError(browserTrustMessage(caught)); }
    finally { setBusy(null); }
  };

  return (
    <section className="space-y-6 pb-8">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Browser</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Choose which websites AgentSam’s browser can open without asking each time. Trust applies to your account only.
        </p>
      </div>
      {error ? <p role="alert" className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">{error}</p> : null}

      <form className="flex max-w-2xl flex-wrap items-end gap-2"
        onSubmit={(event) => { event.preventDefault(); void change("add", async () => { await trustBrowserOrigin(origin, scope); setOrigin(""); }); }}>
        <label className="min-w-56 flex-1 text-xs text-muted-foreground">
          Website
          <input value={origin} onChange={(event) => setOrigin(event.target.value)} placeholder="https://example.com" aria-label="Website to trust"
            className="mt-1 h-9 w-full rounded-md border border-border bg-transparent px-3 text-sm text-foreground outline-none focus-visible:border-accent/60" />
        </label>
        <label className="text-xs text-muted-foreground">
          Trust
          <select value={scope} onChange={(event) => setScope(event.target.value as TrustScope)} aria-label="How long to trust"
            className="mt-1 h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground">
            {(Object.keys(SCOPE_LABELS) as TrustScope[]).map((value) => <option key={value} value={value}>{SCOPE_LABELS[value]}</option>)}
          </select>
        </label>
        <Button type="submit" disabled={!origin.trim() || busy !== null}>{busy === "add" ? "Adding…" : "Trust website"}</Button>
      </form>

      {loading && !trusted.length ? (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" /> Loading…</p>
      ) : trusted.length ? (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {trusted.map((row) => (
            <li key={row.origin} className="flex items-center gap-3 px-4 py-2.5">
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">{row.origin}</span>
              <select value={row.trust_scope} disabled={busy !== null} aria-label={`Trust for ${row.origin}`}
                onChange={(event) => void change(row.origin, () => trustBrowserOrigin(row.origin, event.target.value as TrustScope))}
                className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground">
                {(Object.keys(SCOPE_LABELS) as TrustScope[]).map((value) => <option key={value} value={value}>{SCOPE_LABELS[value]}</option>)}
              </select>
              <IconAction label={`Stop trusting ${row.origin}`} variant="ghost" disabled={busy !== null}
                onClick={() => void change(row.origin, () => untrustBrowserOrigin(row.origin))}>
                <Trash2 className="size-4" />
              </IconAction>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">No trusted websites yet. Add one above.</p>
      )}

      {rules.length ? (
        <div>
          <h3 className="mb-2 text-sm font-medium text-foreground">Embedding rules</h3>
          <p className="mb-2 max-w-2xl text-xs text-muted-foreground">How AgentSam shows these sites. These rules are set by the platform for everyone.</p>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
            {rules.map((rule) => (
              <li key={rule.host_suffix} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                <span className="truncate text-foreground">{rule.host_suffix}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{MODE_LABELS[rule.embed_mode] ?? rule.embed_mode.replace(/_/g, " ")}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

import { useEffect, useState } from "react";
import type { SettingsBillingSnapshot, SettingsHost } from "../contracts/index";
import { safeBillingUrl } from "../contracts/billing";

/** Do not invent USD when the billing provider omitted currency. */
const money = (minor: number | null | undefined, currency: string | null) => {
  if (minor == null || !currency) return "Amount unavailable";
  try {
    const formatter = new Intl.NumberFormat(undefined, { style: "currency", currency });
    const decimalPlaces = formatter.resolvedOptions().maximumFractionDigits ?? 2;
    return formatter.format(minor / (10 ** decimalPlaces));
  } catch { return "Amount unavailable"; }
};
const day = (unix: number | null | undefined) =>
  unix == null ? "—" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(unix * 1000));

/** Presentation only. Host owns authenticated reads and creating provider sessions. */
export function SettingsBillingPanel({ host }: { host: SettingsHost }) {
  const [data, setData] = useState<SettingsBillingSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [opening, setOpening] = useState(false);
  useEffect(() => {
    if (!host.readBilling) {
      setData({ state: "not_configured", plan: null, invoices: [], currency: null,
        source: null, updatedAt: null, message: "This host has not enabled billing." });
      return;
    }
    let cancelled = false;
    setError(null);
    host.readBilling().then(result => { if (!cancelled) setData(result); })
      .catch(() => { if (!cancelled) { setData(null); setError("Billing records could not be retrieved."); } });
    return () => { cancelled = true; };
  }, [host, refresh]);

  async function openPortal() {
    if (!host.openBillingPortal || opening) return;
    setOpening(true);
    setError(null);
    try { await host.openBillingPortal(); }
    catch { setError("Could not open payment management. No billing changes were made."); }
    finally { setOpening(false); }
  }

  return <section className="space-y-4" aria-label="Account billing">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-sm font-semibold text-foreground">Billing & invoices</h2>
        <p className="mt-1 text-xs text-muted-foreground">Verified account charges and payment records. Not estimated model costs.</p></div>
      <button type="button" className="min-h-11 rounded-md border border-border px-3 text-xs font-medium text-foreground"
        onClick={() => { setData(null); setRefresh(value => value + 1); }} disabled={!host.readBilling}>
        Refresh
      </button>
    </div>
    {error && <p role="alert" className="rounded-md border border-destructive/40 p-3 text-xs text-foreground">{error}</p>}
    {!data ? <p role="status" className="py-6 text-sm text-muted-foreground">{error ? "No verified billing data is available." : "Checking billing records…"}</p> :
      data.state !== "ready" ? <div className="rounded-lg border border-border p-4">
        <p className="text-sm font-semibold text-foreground">Billing not available</p>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">{data.message || "No verified billing service is connected."}</p>
      </div> :
      <>
        <div className="rounded-lg border border-border p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Current plan</p>
              <h3 className="mt-1 text-lg font-semibold text-foreground">{data.plan?.name || "No active plan on record"}</h3>
              <p className="mt-2 text-xs text-muted-foreground">
                {data.plan ? `Status: ${data.plan.status} · Renewal: ${day(data.plan.periodEnd)}` : "No recurring subscription has been recorded."}
              </p>
            </div>
            {data.plan?.amountMinor != null && <div className="text-left sm:text-right">
              <strong className="text-lg text-foreground">{money(data.plan.amountMinor, data.plan.currency || data.currency)}</strong>
              <p className="text-xs text-muted-foreground">{data.plan.interval || "Billing interval unavailable"}</p>
            </div>}
          </div>
          {data.plan && host.openBillingPortal && <button type="button" onClick={openPortal} disabled={opening}
            className="mt-4 min-h-11 w-full rounded-md border border-border px-4 text-sm font-medium text-foreground sm:w-auto">
            {opening ? "Opening…" : "Manage billing"}
          </button>}
        </div>
        <div className="overflow-hidden rounded-lg border border-border">
          <div className="border-b border-border px-4 py-3"><h3 className="text-sm font-semibold text-foreground">Invoice history</h3></div>
          {data.invoices.length ? <ul className="divide-y divide-border/70">
            {data.invoices.map(invoice => <li key={invoice.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground">{invoice.id}</p>
                <p className="mt-1 text-xs text-muted-foreground">{invoice.status} · {day(invoice.periodEnd)}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs text-foreground">{money(invoice.amountPaidMinor, invoice.currency || data.currency)}{invoice.amountPaidMinor !== null ? " paid" : ""}</span>
                {safeBillingUrl(invoice.hostedUrl) && <a href={safeBillingUrl(invoice.hostedUrl)!} target="_blank" rel="noopener noreferrer"
                  className="min-h-11 content-center text-xs underline underline-offset-4 text-foreground">View invoice</a>}
                {safeBillingUrl(invoice.pdfUrl) && <a href={safeBillingUrl(invoice.pdfUrl)!} target="_blank" rel="noopener noreferrer"
                  className="min-h-11 content-center text-xs underline underline-offset-4 text-foreground">PDF</a>}
              </div>
            </li>)}
          </ul> : <p className="px-4 py-6 text-sm text-muted-foreground">No invoices have been reported for this billing account.</p>}
        </div>
        <p className="text-xs leading-5 text-muted-foreground">Invoice status comes from the billing provider. An authorization redirect alone does not mean payment succeeded.</p>
      </>
    }
  </section>;
}

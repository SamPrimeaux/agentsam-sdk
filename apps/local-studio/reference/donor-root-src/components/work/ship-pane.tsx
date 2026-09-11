import { Check, Upload } from "lucide-react";

export function ShipPane() {
  return (
    <div className="flex h-full flex-col px-5 py-6">
      <p className="text-xs tracking-[0.14em] text-clay uppercase">Ship</p>
      <h2 className="mt-2 font-display text-2xl tracking-tight text-bone">agentsam-grok-workmode</h2>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-clay">
        Live worker for this studio. Homepage is the portfolio; admin lives at
        /agentsam. Trails stay on this device until you ship.
      </p>
      <dl className="mt-8 space-y-4">
        <div className="rounded-xl bg-surface px-4 py-3">
          <dt className="text-xs tracking-[0.12em] text-clay uppercase">Domain</dt>
          <dd className="mt-1 text-sm text-bone">simple.inneranimalmedia.com</dd>
        </div>
        <div className="rounded-xl bg-surface px-4 py-3">
          <dt className="text-xs tracking-[0.12em] text-clay uppercase">Worker</dt>
          <dd className="mt-1 font-mono text-sm text-bone">agentsam-grok-workmode</dd>
        </div>
        <div className="rounded-xl bg-surface px-4 py-3">
          <dt className="text-xs tracking-[0.12em] text-clay uppercase">Status</dt>
          <dd className="mt-1 flex items-center gap-2 text-sm text-bone">
            <Check className="size-3.5 text-stone" />
            Ready to bind
          </dd>
        </div>
      </dl>
      <p className="mt-auto flex items-center gap-2 pt-6 text-xs text-clay">
        <Upload className="size-3.5" />
        Branch grok/portfolio-admin-workmode
      </p>
    </div>
  );
}

import { useEffect, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Check, Copy, Eye, EyeOff, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type OwnerKind = "account" | "service";

export function MintCredentialModal({
  open,
  onOpenChange,
  onMinted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMinted: () => void;
}) {
  const [kind, setKind] = useState<OwnerKind>("account");
  const [name, setName] = useState("");
  const [expiration, setExpiration] = useState("never");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secretOnce, setSecretOnce] = useState<string | null>(null);
  const [envName, setEnvName] = useState("AGENTSAM_API_KEY");
  const [showSecret, setShowSecret] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSecretOnce(null);
    setShowSecret(false);
    setCopied(false);
    setKind("account");
    setName("");
    setExpiration("never");
    setEnvName("AGENTSAM_API_KEY");
  }, [open]);

  async function mint(event: React.FormEvent) {
    event.preventDefault();
    const label = name.trim();
    if (!label) {
      setError("Name is required — choose any label you will recognize.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/vault/credentials", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind,
          name: label,
          expiration,
          client_type: kind === "service" ? "integration" : "cli",
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        secret_once?: string;
        env?: string;
        credential?: { env?: string };
      };
      if (!response.ok) throw new Error(data.error || `Mint failed (${response.status})`);
      const secret = String(data.secret_once || "").trim();
      if (!secret) throw new Error("mint_returned_no_secret");
      const expectedPrefix = kind === "service" ? "brk_" : "aak_";
      if (!secret.startsWith(expectedPrefix)) {
        throw new Error(`mint_prefix_invalid_expected_${expectedPrefix}`);
      }
      setSecretOnce(secret);
      setEnvName(
        data.env ||
          data.credential?.env ||
          (kind === "service" ? "AGENTSAM_BRIDGE_KEY" : "AGENTSAM_API_KEY"),
      );
      onMinted();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not mint credential");
    } finally {
      setSaving(false);
    }
  }

  async function copySecret() {
    if (!secretOnce) return;
    try {
      await navigator.clipboard.writeText(secretOnce);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("Could not copy to clipboard");
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/70" />
        <DialogPrimitive.Content className="fixed top-1/2 left-1/2 z-50 w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-card p-5 shadow-hairline">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogPrimitive.Title className="text-lg font-medium tracking-tight text-foreground">
                {secretOnce ? "Copy your secret key" : "Create AgentSam key"}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {secretOnce
                  ? "Shown once. Server keeps only a SHA-256 hash."
                  : "Account → aak_* (AGENTSAM_API_KEY). Service → brk_* (AGENTSAM_BRIDGE_KEY). No project scope."}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild>
              <Button type="button" variant="ghost" size="icon" aria-label="Close">
                <X className="size-4" />
              </Button>
            </DialogPrimitive.Close>
          </div>

          {secretOnce ? (
            <div className="mt-6 space-y-4">
              <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                You will not be able to view this key again after closing.
              </div>
              <label className="block space-y-2 text-sm font-medium text-foreground">
                <span>{envName}</span>
                <div className="relative">
                  <Input
                    type={showSecret ? "text" : "password"}
                    value={secretOnce}
                    readOnly
                    className="h-11 pr-24 font-mono text-xs"
                  />
                  <div className="absolute inset-y-0 right-0 flex items-center">
                    <button
                      type="button"
                      className="flex size-10 items-center justify-center text-muted-foreground hover:text-foreground"
                      onClick={() => setShowSecret((v) => !v)}
                      aria-label={showSecret ? "Hide" : "Show"}
                    >
                      {showSecret ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                    <button
                      type="button"
                      className="flex size-10 items-center justify-center text-muted-foreground hover:text-foreground"
                      onClick={() => void copySecret()}
                      aria-label="Copy"
                    >
                      {copied ? <Check className="size-4 text-emerald-400" /> : <Copy className="size-4" />}
                    </button>
                  </div>
                </div>
                <span className="block text-xs font-normal text-muted-foreground">
                  Export as <code className="text-foreground">{envName}</code>.
                </span>
              </label>
              <Button type="button" className="w-full" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </div>
          ) : (
            <form className="mt-6 space-y-4" onSubmit={(event) => void mint(event)}>
              <div>
                <span className="mb-2 block text-sm font-medium text-foreground">Credential type</span>
                <div className="inline-flex rounded-lg bg-muted p-0.5 shadow-hairline">
                  {(
                    [
                      ["account", "Account", "AGENTSAM_API_KEY · aak_*"],
                      ["service", "Service", "AGENTSAM_BRIDGE_KEY · brk_*"],
                    ] as const
                  ).map(([value, label, hint]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setKind(value)}
                      className={
                        kind === value
                          ? "rounded-md bg-foreground px-3 py-2 text-left text-xs font-medium text-background"
                          : "rounded-md px-3 py-2 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
                      }
                    >
                      <span className="block">{label}</span>
                      <span className="mt-0.5 block opacity-70">{hint}</span>
                    </button>
                  ))}
                </div>
              </div>

              <label className="block space-y-2 text-sm font-medium text-foreground">
                <span>Name</span>
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={kind === "service" ? "Local Studio prod" : "Sam’s iMac · CLI"}
                  required
                  maxLength={120}
                  autoFocus
                />
              </label>

              <label className="block space-y-2 text-sm font-medium text-foreground">
                <span>Expiration</span>
                <select
                  value={expiration}
                  onChange={(event) => setExpiration(event.target.value)}
                  className="h-11 w-full rounded-lg bg-muted px-3 text-sm text-foreground shadow-hairline focus-visible:outline-none"
                >
                  <option value="never">Never</option>
                  <option value="30 days">30 days</option>
                  <option value="90 days">90 days</option>
                  <option value="1 year">1 year</option>
                </select>
              </label>

              {error ? (
                <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              ) : null}

              <div className="flex flex-wrap justify-end gap-2 pt-2">
                <DialogPrimitive.Close asChild>
                  <Button type="button" variant="ghost">
                    Cancel
                  </Button>
                </DialogPrimitive.Close>
                <Button type="submit" disabled={saving || !name.trim()}>
                  {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                  {saving ? "Minting…" : "Create secret key"}
                </Button>
              </div>
            </form>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

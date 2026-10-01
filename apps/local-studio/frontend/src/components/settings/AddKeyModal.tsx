import { useEffect, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Eye, EyeOff, KeyRound, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, SecretInput } from "@/components/ui/input";
import { vaultRequest } from "@/lib/vault/client";

/** service_name stored in user_secrets — drives vault AAD + Studio provider map. */
const SERVICES = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "gemini", label: "Gemini" },
  { value: "xai", label: "xAI / Grok" },
  { value: "cursor", label: "Cursor" },
  { value: "cloudflare", label: "Cloudflare" },
  { value: "meshy", label: "Meshy" },
  { value: "resend", label: "Resend" },
  { value: "tavily", label: "Tavily" },
  { value: "github", label: "GitHub" },
  { value: "other", label: "Other" },
] as const;

/**
 * Slide-in drawer to add a provider BYOK secret (account vault).
 * Pattern aligned with IntegrationDrawer — not a centered modal.
 */
export function AddKeyModal({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [service, setService] = useState<(typeof SERVICES)[number]["value"]>("openai");
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [showValue, setShowValue] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setName("");
    setValue("");
    setShowValue(false);
    setService("openai");
  }, [open]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const secretName = name.trim();
    if (!secretName) {
      setError("Name is required — pick any label you will recognize later.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await vaultRequest<{ error?: string; vault_item_id?: string }>("/api/vault/secrets", {
        method: "POST",
        body: {
          service_name: service,
          secret_name: secretName,
          secret_type: "api_key",
          value,
          description: secretName,
        },
      });
      if (!response.ok) throw new Error(response.data.error || `Could not save secret (${response.status})`);
      setValue("");
      onSaved();
      onOpenChange(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save secret");
    } finally {
      setSaving(false);
    }
  }

  const selectedLabel = SERVICES.find((item) => item.value === service)?.label || "Provider";

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/70 data-[state=closed]:opacity-0 data-[state=open]:opacity-100 motion-safe:transition-opacity motion-safe:duration-150" />
        <DialogPrimitive.Content className="fixed inset-x-0 bottom-0 z-50 flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-card shadow-hairline data-[state=closed]:translate-y-full data-[state=open]:translate-y-0 motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[min(28rem,100vw)] sm:rounded-none sm:border-l sm:border-border sm:data-[state=closed]:translate-x-full sm:data-[state=closed]:translate-y-0 sm:data-[state=open]:translate-x-0">
          <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border p-5">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-accent shadow-hairline">
                <KeyRound className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <DialogPrimitive.Title className="text-lg font-medium tracking-tight text-foreground">
                  Add API key
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  Encrypted to your account. Plaintext is never shown again after save.
                </DialogPrimitive.Description>
              </div>
            </div>
            <DialogPrimitive.Close asChild>
              <Button type="button" variant="ghost" size="icon" aria-label="Close">
                <X className="size-4" aria-hidden="true" />
              </Button>
            </DialogPrimitive.Close>
          </header>

          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => void save(event)}
          >
            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              <label className="block space-y-2 text-sm font-medium text-foreground">
                <span>Provider</span>
                <select
                  value={service}
                  onChange={(event) => setService(event.target.value as typeof service)}
                  className="h-11 w-full rounded-lg bg-muted px-3 text-sm text-foreground shadow-hairline focus-visible:outline-none"
                >
                  {SERVICES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-2 text-sm font-medium text-foreground">
                <span>Label</span>
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={`${selectedLabel} production key`}
                  autoComplete="off"
                  required
                  autoFocus
                  maxLength={120}
                />
                <span className="block text-xs font-normal text-muted-foreground">
                  Any name you will recognize later — not shown to other accounts.
                </span>
              </label>

              <label className="block space-y-2 text-sm font-medium text-foreground">
                <span>API key</span>
                <div className="relative">
                  <SecretInput
                    revealed={showValue}
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    placeholder="Paste key or token"
                    className="h-11 pr-12 font-mono"
                    required
                    minLength={8}
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground hover:text-foreground"
                    onClick={() => setShowValue((shown) => !shown)}
                    aria-label={showValue ? "Hide secret" : "Show secret"}
                  >
                    {showValue ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                <span className="block text-xs font-normal text-muted-foreground">
                  This key will not be shown again after you save it.
                </span>
              </label>

              {error ? (
                <p
                  role="alert"
                  className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  {error}
                </p>
              ) : null}
            </div>

            <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border p-5">
              <DialogPrimitive.Close asChild>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </DialogPrimitive.Close>
              <Button type="submit" disabled={saving || value.trim().length < 8 || !name.trim()}>
                {saving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                {saving ? "Encrypting…" : "Save"}
              </Button>
            </footer>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

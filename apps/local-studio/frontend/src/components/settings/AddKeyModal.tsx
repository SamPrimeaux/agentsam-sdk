import { useEffect, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Eye, EyeOff, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const PROVIDERS = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "gemini", label: "Google Gemini" },
  { value: "xai", label: "xAI" },
  { value: "cursor", label: "Cursor" },
  { value: "cloudflare", label: "Cloudflare API token" },
] as const;

export function AddKeyModal({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [provider, setProvider] = useState<(typeof PROVIDERS)[number]["value"]>("openai");
  const [name, setName] = useState("default");
  const [value, setValue] = useState("");
  const [showValue, setShowValue] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setValue("");
    setShowValue(false);
  }, [open]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/vault/secrets", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          service_name: provider,
          secret_name: name.trim() || "default",
          secret_type: "api_key",
          value,
          description: `${PROVIDERS.find((item) => item.value === provider)?.label || provider} API key`,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error || `Could not save key (${response.status})`);
      setValue("");
      onSaved();
      onOpenChange(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save key");
    } finally {
      setSaving(false);
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/70 data-[state=closed]:opacity-0 data-[state=open]:opacity-100 motion-safe:transition-opacity motion-safe:duration-150" />
        <DialogPrimitive.Content className="fixed top-1/2 left-1/2 z-50 w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-card p-5 shadow-hairline">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogPrimitive.Title className="text-lg font-medium tracking-tight text-foreground">
                Add API key
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-sm leading-relaxed text-muted-foreground">
                The key is encrypted before storage and is never shown again.
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild>
              <Button type="button" variant="ghost" size="icon" aria-label="Close">
                <X className="size-4" aria-hidden="true" />
              </Button>
            </DialogPrimitive.Close>
          </div>

          <form className="mt-6 space-y-4" onSubmit={(event) => void save(event)}>
            <label className="block space-y-2 text-sm font-medium text-foreground">
              <span>Provider</span>
              <select
                value={provider}
                onChange={(event) => setProvider(event.target.value as typeof provider)}
                className="h-11 w-full rounded-lg bg-muted px-3 text-sm text-foreground shadow-hairline focus-visible:outline-none"
              >
                {PROVIDERS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-2 text-sm font-medium text-foreground">
              <span>Key name</span>
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="default" />
            </label>

            <label className="block space-y-2 text-sm font-medium text-foreground">
              <span>API key</span>
              <div className="relative">
                <Input
                  type={showValue ? "text" : "password"}
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  autoComplete="off"
                  placeholder="Paste your key"
                  className="h-11 pr-12 font-mono"
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground hover:text-foreground"
                  onClick={() => setShowValue((shown) => !shown)}
                  aria-label={showValue ? "Hide API key" : "Show API key"}
                >
                  {showValue ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </label>

            {error ? (
              <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <DialogPrimitive.Close asChild>
                <Button type="button" variant="ghost">Cancel</Button>
              </DialogPrimitive.Close>
              <Button type="submit" disabled={saving || value.trim().length < 8}>
                {saving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                {saving ? "Encrypting…" : "Save key"}
              </Button>
            </div>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

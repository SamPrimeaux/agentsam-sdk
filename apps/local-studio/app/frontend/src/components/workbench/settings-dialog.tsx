import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { clearSecrets, readSecrets, writeSecrets } from "@/lib/work/secrets";
import { useWorkStore } from "@/lib/work/store";
import {
  THEME_FIELDS,
  THEME_PRESETS,
  applyTheme,
  defaultTheme,
  readTheme,
  writeTheme,
  type StoredTheme,
  type ThemePresetId,
  type ThemeTokens,
} from "@/lib/work/theme";

type Tab = "appearance" | "tokens";

function ColorRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <label className="grid grid-cols-[1fr_auto_7rem] items-center gap-2 text-xs">
      <span className="min-w-0">
        <span className="block text-foreground">{label}</span>
        <span className="text-muted-foreground">{hint}</span>
      </span>
      <input
        type="color"
        value={value.length === 7 ? value : "#000000"}
        onChange={(e) => onChange(e.target.value)}
        className="size-8 cursor-pointer rounded-md border border-border bg-transparent p-0"
        aria-label={label}
      />
      <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-8 font-mono text-[11px]" />
    </label>
  );
}

export function SettingsDialog() {
  const open = useWorkStore((s) => s.settingsOpen);
  const setSettingsOpen = useWorkStore((s) => s.setSettingsOpen);
  const [tab, setTab] = useState<Tab>("appearance");
  const [github, setGithub] = useState("");
  const [cloudflare, setCloudflare] = useState("");
  const [theme, setTheme] = useState<StoredTheme>(defaultTheme);

  useEffect(() => {
    if (!open) return;
    const secrets = readSecrets();
    setGithub(secrets.githubToken);
    setCloudflare(secrets.cloudflareToken);
    setTheme(readTheme());
  }, [open]);

  function commit(next: StoredTheme) {
    setTheme(next);
    writeTheme(next);
    applyTheme(next);
    window.dispatchEvent(new CustomEvent("agentsam:theme", { detail: next }));
  }

  function setToken(key: keyof ThemeTokens, value: string) {
    commit({ ...theme, preset: "custom", tokens: { ...theme.tokens, [key]: value } });
  }

  return (
    <Dialog open={open} onOpenChange={setSettingsOpen}>
      <DialogContent className="w-[min(40rem,calc(100vw-2rem))] max-h-[min(40rem,calc(100dvh-2rem))] overflow-hidden p-0">
        <div className="border-b border-border px-5 py-4">
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Live colors stay on this device. Ship tokens never leave the browser except toward GitHub or Cloudflare.</DialogDescription>
          <div className="mt-3 flex gap-1">
            {(["appearance", "tokens"] as Tab[]).map((id) => (
              <Button key={id} type="button" size="sm" variant={tab === id ? "secondary" : "ghost"} className="h-7 rounded-full capitalize" onClick={() => setTab(id)}>
                {id}
              </Button>
            ))}
          </div>
        </div>

        {tab === "appearance" ? (
          <div className="flex max-h-[28rem] flex-col gap-4 overflow-y-auto px-5 py-4">
            <div>
              <p className="mb-2 text-xs text-muted-foreground">Preset</p>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(THEME_PRESETS) as ThemePresetId[]).map((id) => (
                  <Button
                    key={id}
                    type="button"
                    size="sm"
                    variant={theme.preset === id ? "secondary" : "outline"}
                    className="h-8 rounded-full"
                    onClick={() =>
                      commit({
                        preset: id,
                        tokens: { ...THEME_PRESETS[id].tokens },
                        monacoBase: id === "bone-paper" ? "vs" : "vs-dark",
                      })
                    }
                  >
                    {THEME_PRESETS[id].label}
                  </Button>
                ))}
                <Button type="button" size="sm" variant="ghost" className="h-8 rounded-full" onClick={() => commit(defaultTheme())}>
                  Reset
                </Button>
              </div>
            </div>

            <label className="flex items-center justify-between gap-3 text-sm">
              <span>
                Monaco base
                <span className="mt-0.5 block text-xs text-muted-foreground">Editor chrome follows these tokens live.</span>
              </span>
              <select
                value={theme.monacoBase}
                onChange={(e) => commit({ ...theme, monacoBase: e.target.value as StoredTheme["monacoBase"] })}
                className="h-8 rounded-full border border-border bg-card px-3 text-xs"
              >
                <option value="vs-dark">Dark</option>
                <option value="vs">Light</option>
              </select>
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              {THEME_FIELDS.map((field) => (
                <ColorRow
                  key={field.key}
                  label={field.label}
                  hint={field.hint}
                  value={theme.tokens[field.key]}
                  onChange={(value) => setToken(field.key, value)}
                />
              ))}
            </div>

            <div className="rounded-2xl border border-border bg-background p-3">
              <p className="text-xs text-muted-foreground">Preview</p>
              <div className="mt-2 rounded-xl bg-card p-3 shadow-[0_0_0_1px_var(--color-ring)]">
                <p className="text-sm text-foreground">Work with AgentSam</p>
                <p className="mt-1 text-xs text-muted-foreground">Focus ring uses the ring token.</p>
              </div>
            </div>
          </div>
        ) : (
          <form
            className="flex flex-col gap-3 px-5 py-4"
            onSubmit={(e) => {
              e.preventDefault();
              writeSecrets({ githubToken: github.trim(), cloudflareToken: cloudflare.trim() });
              setSettingsOpen(false);
            }}
          >
            <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
              GitHub token
              <Input type="password" autoComplete="off" value={github} onChange={(e) => setGithub(e.target.value)} placeholder="ghp_…" />
            </label>
            <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
              Cloudflare API token
              <Input type="password" autoComplete="off" value={cloudflare} onChange={(e) => setCloudflare(e.target.value)} placeholder="Pages edit permission" />
            </label>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  clearSecrets();
                  setGithub("");
                  setCloudflare("");
                }}
              >
                Clear
              </Button>
              <Button type="submit">Save tokens</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

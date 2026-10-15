import { useCallback, useState } from "react";
import { Settings2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { getTauriInvoke, isPackagedDesktop } from "@/lib/desktop/tauri";

type Pack = {
  id: string;
  status: string;
  server_binary?: string;
  resolved_path?: string;
  install_hint?: string;
};
type PacksResponse = { packs?: Record<string, Pack> };

const LANGUAGE_PACKS = [
  { id: "language.typescript-lsp", name: "TypeScript / JavaScript", command: "npm install -g typescript typescript-language-server" },
  { id: "language.rust", name: "Rust", command: "rustup component add rust-analyzer" },
  { id: "language.go", name: "Go", command: "go install golang.org/x/tools/gopls@latest" },
  { id: "language.python", name: "Python", command: "npm install -g pyright" },
] as const;

/** Explicit opt-in setup for real external LSP binaries. No hidden download on editor open. */
export function LspLanguageSetup({ onInstalled }: { onInstalled(): void }) {
  const [open, setOpen] = useState(false);
  const [packs, setPacks] = useState<PacksResponse | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const invoke = getTauriInvoke();
    if (!invoke) return;
    setBusy("refresh");
    setError(null);
    try {
      const handshake = await invoke("ensure_agentsamd", {}) as { ok?: boolean; message?: string };
      if (!handshake.ok) throw new Error(handshake.message || "agentsamd_unavailable");
      const response = await invoke("agentsamd_language_packs", {}) as PacksResponse;
      setPacks(response);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Language pack discovery failed");
    } finally {
      setBusy(null);
    }
  }, []);

  async function install(id: string, label: string, command: string) {
    const invoke = getTauriInvoke();
    if (!invoke) return;
    if (!window.confirm("Install " + label + " language server on this Mac?\n\nThis runs:\n" + command + "\n\nIt may download dependencies and modify your user toolchain.")) return;
    setBusy(id);
    setError(null);
    try {
      await invoke("agentsamd_install_language_pack", { id });
      const next = await invoke("agentsamd_language_packs", {}) as PacksResponse;
      setPacks(next);
      onInstalled();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Language server installation failed");
    } finally {
      setBusy(null);
    }
  }

  if (!isPackagedDesktop()) return null;
  return <>
    <Button type="button" size="sm" variant="outline" className="min-h-9 shrink-0"
      title="Check or install language servers" onClick={() => { setOpen(true); void refresh(); }}>
      <Settings2 className="mr-1 size-3.5"/> LSP setup
    </Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[88dvh] overflow-y-auto sm:max-w-xl">
        <DialogTitle>Language servers</DialogTitle>
        <DialogDescription>
          Monaco includes basic syntax support. Full diagnostics and navigation use installed language servers through the native AgentSam IDE bridge. Nothing is installed without your approval.
        </DialogDescription>
        {error ? <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-xs text-destructive">{error}</p> : null}
        <div className="space-y-2">
          {LANGUAGE_PACKS.map((item) => {
            const pack = packs?.packs?.[item.id];
            const available = pack?.status === "ready";
            return <div key={item.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3">
              <div className="min-w-0 flex-1">
                <strong className="text-sm">{item.name}</strong>
                <p className="mt-1 break-all text-[11px] text-muted-foreground">
                  {available ? pack?.resolved_path || "Installed" : pack?.install_hint || item.command}
                </p>
              </div>
              <span className={"text-xs font-semibold " + (available ? "text-green-600" : "text-muted-foreground")}>
                {available ? "Ready" : pack ? pack.status : "Not discovered"}
              </span>
              {!available && pack ? <Button type="button" size="sm" variant="outline" disabled={Boolean(busy)}
                onClick={() => void install(item.id, item.name, item.command)}>{busy === item.id ? "Installing…" : "Install"}</Button> : null}
            </div>;
          })}
        </div>
        <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => void refresh()}>
          <RefreshCw className="mr-2 size-4"/> {busy === "refresh" ? "Checking…" : "Recheck"}
        </Button>
      </DialogContent>
    </Dialog>
  </>;
}

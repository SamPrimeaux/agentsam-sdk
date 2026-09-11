import { useMemo, useState } from "react";
import { Maximize2, Minimize2, MonitorPlay } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Composer } from "@/components/workbench/composer";
import { BrowserStage } from "@/components/workbench/browser";
import { useActiveSideTab, useWorkStore } from "@/lib/work/store";
import {
  COMPUTER_PROVIDERS,
  type ComputerProvider,
  type ComputerSurface,
} from "@/lib/work/computer-use";

export function ComputerFullscreen({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const tab = useActiveSideTab();
  const trailId = useWorkStore((s) => s.activeTrailId);
  const [provider, setProvider] = useState<ComputerProvider>("google-gemini-computer-use");
  const [surface, setSurface] = useState<ComputerSurface>("browser");
  const meta = useMemo(
    () => COMPUTER_PROVIDERS.find((p) => p.id === provider),
    [provider],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
        <MonitorPlay className="size-4 text-stone" />
        <p className="text-sm font-medium">Computer use</p>
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value as ComputerProvider)}
          className="h-8 max-w-56 rounded-full border border-border bg-card px-3 text-xs"
          aria-label="Computer-use provider"
        >
          {COMPUTER_PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <select
          value={surface}
          onChange={(e) => setSurface(e.target.value as ComputerSurface)}
          className="h-8 rounded-full border border-border bg-card px-3 text-xs"
          aria-label="Surface"
        >
          <option value="browser">Browser</option>
          <option value="desktop">Desktop</option>
          <option value="mobile">Mobile</option>
          <option value="sandbox">Sandbox</option>
        </select>
        <p className="hidden min-w-0 flex-1 truncate text-xs text-muted-foreground md:block">
          {meta?.hint}. Composer stays live so the agent can take over when asked.
        </p>
        <Button type="button" size="icon-sm" variant="ghost" aria-label="Exit fullscreen" onClick={onClose}>
          <Minimize2 className="size-4" />
        </Button>
      </header>

      <div className="min-h-0 flex-1 bg-card">
        {tab?.kind === "browser" ? (
          <BrowserStage tab={tab} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="text-sm text-muted-foreground">
              Fullscreen takeover uses the side-stage browser when one is open.
              Open a Browser tab, then expand again — or keep talking below.
            </p>
            <p className="max-w-lg text-xs text-muted-foreground">
              Google Antigravity environments persist files by environment_id. Gemini computer_use
              returns click/type actions; the desk (Playwright or the iMac tunnel) executes them.
              Keys never live in the Vite bundle.
            </p>
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-border bg-background">
        <Composer
          targetId={trailId}
          targetKind="trail"
          placeholder="Tell the agent to take over this surface…"
        />
      </div>
    </div>
  );
}

export function FullscreenTrigger({ onClick }: { onClick: () => void }) {
  return (
    <Button type="button" size="icon-sm" variant="ghost" aria-label="Fullscreen with composer" onClick={onClick}>
      <Maximize2 className="size-4" />
    </Button>
  );
}

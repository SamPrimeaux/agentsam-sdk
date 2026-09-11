import { useEffect } from "react";
import { Outlet, useNavigate } from "@tanstack/react-router";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CommandPalette } from "@/components/workbench/command-palette";
import { SettingsDialog } from "@/components/workbench/settings-dialog";
import { NavRail } from "@/components/shell/nav-rail";
import { OfflineBanner } from "@/components/shell/offline-banner";
import { CliDrawer } from "@/components/shell/cli-drawer";
import { registerOfflineShell } from "@/lib/offline/register-sw";
import { useOnline } from "@/hooks/use-online";
import { cn } from "@/lib/utils";
import { useWorkStore } from "@/lib/work/store";
import { applyTheme, readTheme } from "@/lib/work/theme";

export function AppShell() {
  const navigate = useNavigate();
  const online = useOnline();
  const flushOfflineQueue = useWorkStore((s) => s.flushOfflineQueue);

  useEffect(() => {
    void useWorkStore.persist.rehydrate();
    const unsub = useWorkStore.persist.onFinishHydration(() => {
      useWorkStore.getState().setHydrated(true);
    });
    if (useWorkStore.persist.hasHydrated()) useWorkStore.getState().setHydrated(true);
    applyTheme(readTheme());
    registerOfflineShell();
    return unsub;
  }, []);

  useEffect(() => {
    if (online) void flushOfflineQueue();
  }, [online, flushOfflineQueue]);

  useEffect(() => {
    function onNav(event: Event) {
      const detail = (event as CustomEvent<{ to: string; params?: Record<string, string> }>).detail;
      if (!detail?.to) return;
      void navigate({ to: detail.to, params: detail.params } as never);
    }
    window.addEventListener("agentsam:navigate", onNav);
    return () => window.removeEventListener("agentsam:navigate", onNav);
  }, [navigate]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === "n" && !event.shiftKey) {
        event.preventDefault();
        const id = useWorkStore.getState().startTrail();
        void navigate({ to: "/trails/$trailId", params: { trailId: id } });
      }
      if (meta && event.key === "`") {
        event.preventDefault();
        useWorkStore.getState().toggleTerminal();
      }
      if (meta && event.key.toLowerCase() === "b") {
        event.preventDefault();
        void navigate({ to: "/trails" });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  return (
    <TooltipProvider>
      <div className="flex h-dvh overflow-hidden bg-background text-foreground">
        <NavRail />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <OfflineBanner />
          <main className="min-h-0 flex-1 overflow-hidden">
            <Outlet />
          </main>
        </div>
        <CliDrawer />
        <CommandPalette />
        <SettingsDialog />
        <Toaster
          theme="dark"
          position="bottom-center"
          toastOptions={{
            className: cn("border-border bg-card text-foreground"),
          }}
        />
      </div>
    </TooltipProvider>
  );
}

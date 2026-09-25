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
import { Nav } from "@inneranimalmedia/agentsam-nav";

/**
 * Canonical Local Studio dashboard/workbench shell.
 *
 * This is the Local Studio adaptation seam for the production
 * inneranimalmedia AppShellFrame. Keep app-specific routing/state here and
 * move reusable panes into @inneranimalmedia/agentsam-workbench.
 */
export function AppShellFrame() {
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
    function onOpenSideTab(event: Event) {
      const detail = (event as CustomEvent<{ kind?: string; title?: string }>).detail;
      const kind = detail?.kind;
      if (!kind) return;
      const { openSideTab, setSideOpen } = useWorkStore.getState();
      openSideTab(kind as never, { ephemeral: false, title: detail.title });
      setSideOpen(true);
    }
    window.addEventListener("agentsam:open-side-tab", onOpenSideTab);
    return () => window.removeEventListener("agentsam:open-side-tab", onOpenSideTab);
  }, []);

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
      <Nav.Provider defaultOpen mobileBreakpoint={768} peekable resizable>
        <div className="flex h-dvh overflow-hidden bg-background text-foreground" data-agentsam-app-shell="local-studio">
          <NavRail />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <header className="flex h-14 shrink-0 items-center border-b border-border px-3 md:hidden">
              <Nav.Trigger />
            </header>
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
      </Nav.Provider>
    </TooltipProvider>
  );
}

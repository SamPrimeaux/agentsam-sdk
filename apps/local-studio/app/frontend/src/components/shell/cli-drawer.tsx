import { useCallback, useEffect, useRef } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Maximize2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TerminalPane } from "@/components/workbench/terminal";
import { cn } from "@/lib/utils";
import { useActiveProject, useWorkStore } from "@/lib/work/store";

export function CliDrawer() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const open = useWorkStore((s) => s.terminalOpen);
  const height = useWorkStore((s) => s.terminalHeight);
  const setTerminalOpen = useWorkStore((s) => s.setTerminalOpen);
  const setTerminalHeight = useWorkStore((s) => s.setTerminalHeight);
  const project = useActiveProject();
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);
  const onFullPage = pathname.startsWith("/cli");

  const onPointerMove = useCallback(
    (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const delta = drag.startY - event.clientY;
      const next = drag.startH + delta / window.innerHeight;
      setTerminalHeight(next);
    },
    [setTerminalHeight],
  );

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  }, [onPointerMove]);

  useEffect(() => () => onPointerUp(), [onPointerUp]);

  if (onFullPage || !open) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Dismiss CLI drawer"
        className="fixed inset-x-0 top-12 bottom-0 z-40 bg-ink/40 md:hidden"
        onClick={() => setTerminalOpen(false)}
      />
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 flex flex-col border-t border-border bg-background shadow-[0_-12px_40px_#00000066]",
          "md:left-14",
        )}
        style={{
          height: `min(${Math.round(height * 100)}dvh, calc(100dvh - env(safe-area-inset-top) - 3rem))`,
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize CLI"
          className="flex h-10 shrink-0 cursor-ns-resize touch-none items-center gap-2 border-b border-border px-2"
          onPointerDown={(event) => {
            event.preventDefault();
            dragRef.current = { startY: event.clientY, startH: height };
            window.addEventListener("pointermove", onPointerMove);
            window.addEventListener("pointerup", onPointerUp);
          }}
        >
          <div className="mx-auto h-1 w-10 rounded-full bg-muted-foreground/40 md:mx-0" />
          <span className="hidden font-mono text-[11px] tracking-wide text-muted-foreground uppercase md:inline">
            CLI
          </span>
          <span className="hidden truncate font-mono text-[11px] text-clay md:inline">{project.name}</span>
          <div className="ml-auto flex items-center gap-0.5">
            <Button asChild size="icon-sm" variant="ghost" aria-label="Expand CLI">
              <Link to="/cli">
                <Maximize2 className="size-3.5" />
              </Link>
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Close CLI"
              onClick={() => setTerminalOpen(false)}
            >
              <X className="size-3.5" />
            </Button>
          </div>
        </div>
        <div className="min-h-0 flex-1">
          <TerminalPane variant="page" />
        </div>
      </div>
    </>
  );
}

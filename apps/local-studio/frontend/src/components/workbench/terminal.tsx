import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActiveProject, useWorkStore } from "@/lib/work/store";
import { LOCAL_TERMINAL_SESSION_ID } from "@/lib/work/terminal-host";
import { attachSharedTerminal, detachSharedTerminal, getSharedTerminalRun } from "@/lib/work/terminal-runtime";

export function TerminalPane({
  variant = "dock",
  sessionId = LOCAL_TERMINAL_SESSION_ID,
}: {
  variant?: "dock" | "page" | "side";
  sessionId?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const project = useActiveProject();
  const projectRef = useRef(project);
  projectRef.current = project;
  const pending = useWorkStore((s) => s.pendingCommands);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;

    void attachSharedTerminal(host, () => projectRef.current, sessionId).then(() => {
      if (cancelled) detachSharedTerminal(host, sessionId);
    });

    return () => {
      cancelled = true;
      detachSharedTerminal(host, sessionId);
    };
  }, [sessionId]);

  useEffect(() => {
    if (!pending.length) return;
    const cmds = useWorkStore.getState().consumeCommands();
    const run = getSharedTerminalRun(sessionId);
    if (!run) return;
    void (async () => {
      for (const cmd of cmds) {
        await run(cmd);
      }
    })();
  }, [pending, sessionId]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background" data-terminal-session={sessionId}>
      {variant === "dock" ? (
        <div className="flex h-8 shrink-0 items-center gap-2 border-t border-border px-2">
          <span className="px-1 font-mono text-[11px] tracking-wide text-muted-foreground uppercase">CLI</span>
          <span className="truncate font-mono text-[11px] text-clay">{project.name}</span>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="ml-auto size-7"
            aria-label="Close terminal"
            onClick={() => useWorkStore.getState().setTerminalOpen(false)}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      ) : null}
      <div ref={hostRef} className="terminal-host min-h-0 flex-1 px-1 pb-[env(safe-area-inset-bottom)]" />
    </div>
  );
}

import { useEffect, useRef } from "react";
import { Copy, Plus, RotateCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActiveProject, useWorkStore } from "@/lib/work/store";
import { attachSharedTerminal, detachSharedTerminal, getSharedTerminalRun } from "@/lib/work/terminal-runtime";
import { useTerminalSessionStore } from "@/lib/work/terminal-sessions";

export function TerminalPane({
  variant = "dock",
  sessionId,
}: {
  variant?: "dock" | "page" | "side";
  sessionId?: string;
}) {
  const activeSessionId = useTerminalSessionStore((s) => s.activeSessionId);
  const sessions = useTerminalSessionStore((s) => s.sessions);
  const createSession = useTerminalSessionStore((s) => s.createSession);
  const closeSession = useTerminalSessionStore((s) => s.closeSession);
  const duplicateSession = useTerminalSessionStore((s) => s.duplicateSession);
  const setActiveSession = useTerminalSessionStore((s) => s.setActiveSession);
  const resolvedSessionId = sessionId || activeSessionId;
  const hostRef = useRef<HTMLDivElement>(null);
  const project = useActiveProject();
  const projectRef = useRef(project);
  projectRef.current = project;
  const pending = useWorkStore((s) => s.pendingCommands);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;

    void attachSharedTerminal(host, () => projectRef.current, resolvedSessionId).then(() => {
      if (cancelled) detachSharedTerminal(host, resolvedSessionId);
    });

    return () => {
      cancelled = true;
      detachSharedTerminal(host, resolvedSessionId);
    };
  }, [resolvedSessionId]);

  useEffect(() => {
    if (!pending.length) return;
    const cmds = useWorkStore.getState().consumeCommands();
    const run = getSharedTerminalRun(resolvedSessionId);
    if (!run) return;
    void (async () => {
      for (const cmd of cmds) {
        await run(cmd);
      }
    })();
  }, [pending, resolvedSessionId]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background" data-terminal-session={resolvedSessionId}>
      <div className="flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-b border-border px-1">
        {sessions.map((session) => (
          <button
            type="button"
            key={session.id}
            className="group flex h-7 shrink-0 items-center gap-2 rounded-md px-2 font-mono text-xs text-muted-foreground data-[active=true]:bg-muted data-[active=true]:text-foreground"
            data-active={session.id === resolvedSessionId}
            onClick={() => setActiveSession(session.id)}
            title={`${session.runtimeLabel || session.lane}${session.cwd ? ` · ${session.cwd}` : ""}`}
          >
            <span className="size-1.5 rounded-full bg-muted-foreground data-[state=connected]:bg-primary" data-state={session.state} />
            <span>{session.title}</span>
            <span
              role="button"
              tabIndex={0}
              className="opacity-0 transition-opacity group-hover:opacity-100"
              aria-label={`Close ${session.title}`}
              onClick={(event) => { event.stopPropagation(); closeSession(session.id); }}
              onKeyDown={(event) => { if (event.key === "Enter") closeSession(session.id); }}
            >
              <X className="size-3" />
            </span>
          </button>
        ))}
        <Button type="button" size="icon-sm" variant="ghost" className="size-7 shrink-0" aria-label="New terminal" onClick={() => createSession({ cwd: project.workspaceRoot || undefined })}>
          <Plus className="size-3.5" />
        </Button>
        <Button type="button" size="icon-sm" variant="ghost" className="size-7 shrink-0" aria-label="Duplicate terminal cwd" onClick={() => duplicateSession(resolvedSessionId)}>
          <Copy className="size-3.5" />
        </Button>
        <Button type="button" size="icon-sm" variant="ghost" className="size-7 shrink-0" aria-label="Reconnect terminal" onClick={() => window.location.reload()}>
          <RotateCw className="size-3.5" />
        </Button>
      </div>
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

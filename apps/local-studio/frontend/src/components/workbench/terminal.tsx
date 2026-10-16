import { useEffect, useRef } from "react";
import { Columns2, Copy, Plus, RotateCw, X } from "lucide-react";
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
  const splitView = useTerminalSessionStore((s) => s.splitView);
  const secondarySessionId = useTerminalSessionStore((s) => s.secondarySessionId);
  const setSplitView = useTerminalSessionStore((s) => s.setSplitView);
  const setSecondarySession = useTerminalSessionStore((s) => s.setSecondarySession);
  const createSession = useTerminalSessionStore((s) => s.createSession);
  const closeSession = useTerminalSessionStore((s) => s.closeSession);
  const duplicateSession = useTerminalSessionStore((s) => s.duplicateSession);
  const setActiveSession = useTerminalSessionStore((s) => s.setActiveSession);
  const resolvedSessionId = sessionId || activeSessionId;
  const project = useActiveProject();
  const pending = useWorkStore((s) => s.pendingCommands);
  const secondarySession = splitView
    ? sessions.find((session) => session.id === secondarySessionId && session.id !== resolvedSessionId)
    : undefined;

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
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          className="size-7 shrink-0"
          aria-label={splitView ? "Close split terminal" : "Split terminal into two interactive panes"}
          aria-pressed={splitView}
          title={splitView ? "Single terminal" : "Monitor two terminals side by side"}
          onClick={() => {
            if (splitView) { setSplitView(false); return; }
            const other = sessions.find((session) => session.id !== resolvedSessionId);
            if (other) {
              setSecondarySession(other.id);
            } else {
              // A new PTY session is distinct, never another mount of the same xterm.
              const previous = resolvedSessionId;
              createSession({ cwd: project.workspaceRoot || undefined });
              setSecondarySession(previous);
            }
            setSplitView(true);
          }}
        >
          <Columns2 className="size-3.5" />
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
      <div className="flex min-h-0 min-w-0 flex-1 flex-col md:flex-row">
        <TerminalViewport sessionId={resolvedSessionId} />
        {secondarySession ? (
          <section className="flex min-h-0 min-w-0 flex-1 flex-col border-border/60 max-md:border-t md:border-l" aria-label="Adjacent terminal">
            <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border/60 px-2">
              <span className="font-mono text-[11px] text-muted-foreground">Adjacent PTY</span>
              <select
                aria-label="Choose adjacent terminal session"
                className="ml-auto min-w-0 max-w-[60%] rounded bg-transparent px-1 text-xs text-foreground outline-offset-2"
                value={secondarySession.id}
                onChange={(event) => setSecondarySession(event.target.value)}
              >
                {sessions.filter((session) => session.id !== resolvedSessionId).map((session) => (
                  <option key={session.id} value={session.id}>{session.title} · {session.state}</option>
                ))}
              </select>
            </div>
            <TerminalViewport sessionId={secondarySession.id} />
          </section>
        ) : null}
      </div>
    </div>
  );
}

/** Mount each PTY into exactly one host; splitting never duplicates a terminal element. */
function TerminalViewport({ sessionId }: { sessionId: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const project = useActiveProject();
  const projectRef = useRef(project);
  projectRef.current = project;

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

  return <div ref={hostRef} data-terminal-viewport={sessionId} className="terminal-host min-h-0 min-w-0 flex-1 px-1 pb-[env(safe-area-inset-bottom)]" />;
}

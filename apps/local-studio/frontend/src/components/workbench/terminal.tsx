import { useEffect, useRef } from "react";
import { Columns2, Copy, Grid2X2, Maximize2, PanelTop, Plus, RotateCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconAction } from "@/components/ui/icon-action";
import { useActiveProject, useWorkStore } from "@/lib/work/store";
import { navigateApp } from "@/lib/work/navigate";
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
  const gridView = useTerminalSessionStore((s) => s.gridView);
  const gridSessionIds = useTerminalSessionStore((s) => s.gridSessionIds ?? []);
  const secondarySessionId = useTerminalSessionStore((s) => s.secondarySessionId);
  const setSplitView = useTerminalSessionStore((s) => s.setSplitView);
  const setGridView = useTerminalSessionStore((s) => s.setGridView);
  const setGridSession = useTerminalSessionStore((s) => s.setGridSession);
  const setSecondarySession = useTerminalSessionStore((s) => s.setSecondarySession);
  const createSession = useTerminalSessionStore((s) => s.createSession);
  const closeSession = useTerminalSessionStore((s) => s.closeSession);
  const duplicateSession = useTerminalSessionStore((s) => s.duplicateSession);
  const setActiveSession = useTerminalSessionStore((s) => s.setActiveSession);
  const resolvedSessionId = sessionId || activeSessionId;
  const project = useActiveProject();
  const pending = useWorkStore((s) => s.pendingCommands);
  const secondarySession = splitView && !gridView
    ? sessions.find((session) => session.id === secondarySessionId && session.id !== resolvedSessionId)
    : undefined;
  // A PTY may be mounted only once: ordered, unique IDs render into independent tile hosts.
  const visibleIds = [...new Set(gridSessionIds)].filter((id) => sessions.some((s) => s.id === id)).slice(0, 5);

  useEffect(() => {
    if (!pending.length) return;
    const cmds = useWorkStore.getState().consumeCommands();
    const run = getSharedTerminalRun(resolvedSessionId);
    if (!run) return;
    void (async () => {
      for (const cmd of cmds) await run(cmd);
    })();
  }, [pending, resolvedSessionId]);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col bg-background" data-terminal-session={resolvedSessionId}>
      <div className="flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-b border-border px-1">
        {sessions.map((session) => (
          <div key={session.id} className="group flex h-7 shrink-0 items-center rounded-md pr-1 font-mono text-xs text-muted-foreground data-[active=true]:bg-muted data-[active=true]:text-foreground" data-active={session.id === resolvedSessionId}>
            <button
              type="button"
              className="flex min-w-0 items-center gap-2 px-2"
              onClick={() => setActiveSession(session.id)}
              title={'' + (session.runtimeLabel || session.lane) + (session.cwd ? ' · ' + session.cwd : '')}
            >
              <span className="size-1.5 rounded-full bg-muted-foreground data-[state=connected]:bg-primary" data-state={session.state} />
              <span>{session.title}</span>
            </button>
            <button type="button" className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100" aria-label={'Close ' + session.title} onClick={() => closeSession(session.id)}>
              <X className="size-3" />
            </button>
          </div>
        ))}
        <Button type="button" size="icon-sm" variant="ghost" className="size-7 shrink-0" aria-label="New terminal" onClick={() => createSession({ cwd: project.workspaceRoot || undefined })}>
          <Plus className="size-3.5" />
        </Button>
        <Button type="button" size="icon-sm" variant="ghost" className="size-7 shrink-0" aria-label="Duplicate terminal cwd" onClick={() => duplicateSession(resolvedSessionId)}>
          <Copy className="size-3.5" />
        </Button>
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <IconAction size="icon-sm" variant="ghost" label="Single terminal" hint="Focus on the selected terminal" aria-pressed={!splitView && !gridView} onClick={() => { setGridView(false); setSplitView(false); }}>
            <PanelTop className="size-3.5" />
          </IconAction>
          <IconAction
            size="icon-sm" variant="ghost"
            label="Split two terminals"
            aria-pressed={splitView && !gridView}
            hint="Run two independent PTY sessions in adjacent panes"
            onClick={() => {
              if (splitView && !gridView) { setSplitView(false); return; }
              const other = sessions.find((session) => session.id !== resolvedSessionId);
              if (other) setSecondarySession(other.id);
              else {
                const previous = resolvedSessionId;
                createSession({ cwd: project.workspaceRoot || undefined });
                setSecondarySession(previous);
              }
              setSplitView(true);
            }}
          ><Columns2 className="size-3.5" /></IconAction>
          <IconAction
            size="icon-sm" variant="ghost"
            label={gridView ? "Close tiled terminals" : "Tile terminal sessions"}
            aria-pressed={gridView}
            hint="Monitor up to five independent agents, shells, and servers"
            onClick={() => setGridView(!gridView)}
          ><Grid2X2 className="size-3.5" /></IconAction>
          {variant !== "page" && <IconAction size="icon-sm" variant="ghost" label="Open full terminal workspace" hint="Expand tiled terminals to their own workspace" onClick={() => navigateApp("/cli")}>
            <Maximize2 className="size-3.5" />
          </IconAction>}
          <Button type="button" size="icon-sm" variant="ghost" className="size-7 shrink-0" aria-label="Reconnect terminal" onClick={() => window.location.reload()}>
            <RotateCw className="size-3.5" />
          </Button>
        </div>
      </div>
      {variant === "dock" ? (
        <div className="flex h-8 shrink-0 items-center gap-2 border-t border-border px-2">
          <span className="px-1 font-mono text-[11px] tracking-wide text-muted-foreground uppercase">CLI</span>
          <span className="truncate font-mono text-[11px] text-clay">{project.name}</span>
          <Button type="button" size="icon-sm" variant="ghost" className="ml-auto size-7" aria-label="Close terminal" onClick={() => useWorkStore.getState().setTerminalOpen(false)}>
            <X className="size-3.5" />
          </Button>
        </div>
      ) : null}
      <div className="terminal-tiles-region min-h-0 min-w-0 flex-1">
        {gridView ? (
          <div className="terminal-tile-grid" data-testid="terminal-tile-grid">
            {visibleIds.map((id, index) => {
              const session = sessions.find((s) => s.id === id)!;
              return (
                <section key={id} className="terminal-tile" data-selected={id === resolvedSessionId} data-last={visibleIds.length === 5 && index === 4} aria-label={'Terminal tile ' + (index + 1)}>
                  <div className="terminal-tile-toolbar">
                    <button type="button" onClick={() => setActiveSession(id)} aria-label={'Focus ' + session.title} className="flex min-w-0 items-center gap-2 text-xs text-foreground">
                      <span className="text-muted-foreground">{index + 1}</span>
                      <span className="size-1.5 rounded-full bg-muted-foreground data-[state=connected]:bg-primary" data-state={session.state} />
                      <span className="truncate">{session.title}</span>
                    </button>
                    <select aria-label={'Terminal ' + (index + 1) + ' session'} className="ml-auto max-w-[44%] truncate rounded bg-transparent text-[11px] text-muted-foreground" value={id} onChange={(event) => setGridSession(index, event.target.value)}>
                      {sessions.filter((s) => s.id === id || !visibleIds.includes(s.id)).map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                    </select>
                  </div>
                  <TerminalViewport sessionId={id} />
                </section>
              );
            })}
            {visibleIds.length < 5 && (
              <div className="terminal-tile-empty">
                <Button type="button" variant="ghost" size="sm" className="gap-2 text-muted-foreground" onClick={() => createSession({ cwd: project.workspaceRoot || undefined })}>
                  <Plus className="size-4" /> New terminal tile
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="terminal-two-pane" data-split={Boolean(secondarySession)}>
            <TerminalViewport sessionId={resolvedSessionId} />
            {secondarySession && (
              <section className="terminal-adjacent min-h-0 min-w-0" aria-label="Adjacent terminal">
                <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border/60 px-2">
                  <span className="font-mono text-[11px] text-muted-foreground">Adjacent PTY</span>
                  <select aria-label="Choose adjacent terminal session" className="ml-auto min-w-0 max-w-[60%] rounded bg-transparent px-1 text-xs text-foreground outline-offset-2" value={secondarySession.id} onChange={(event) => setSecondarySession(event.target.value)}>
                    {sessions.filter((s) => s.id !== resolvedSessionId).map((s) => <option key={s.id} value={s.id}>{s.title} · {s.state}</option>)}
                  </select>
                </div>
                <TerminalViewport sessionId={secondarySession.id} />
              </section>
            )}
          </div>
        )}
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

import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  FONT_SIZE_RANGE,
  LINE_HEIGHT_RANGE,
  MIN_CONTRAST_RATIO,
  TERMINAL_PROFILES,
  normalizeHex,
  resolveSessionAppearance,
  useSessionAppearance,
  useTerminalAppearanceStore,
} from "@/lib/work/terminal-appearance";
import { shellNewCommand, shellResetAppearance, useTerminalUiStore } from "@/lib/work/terminal-commands";
import { useTerminalSessionStore } from "@/lib/work/terminal-sessions";

/**
 * Terminal prompts that native menus cannot host (rename, new command) plus the
 * in-app appearance editor. The appearance editor is the hosted-web equivalent of
 * the native color panel and writes through the same per-session appearance store;
 * it also carries the font size / line height controls on every platform.
 */
export function TerminalDialogs() {
  const dialog = useTerminalUiStore((s) => s.dialog);
  const close = useTerminalUiStore((s) => s.close);
  const exists = useTerminalSessionStore((s) => (dialog ? s.sessions.some((x) => x.id === dialog.sessionId) : false));
  useEffect(() => {
    if (dialog && !exists) close();
  }, [dialog, exists, close]);
  if (!dialog || !exists) return null;
  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent portalToBody>
        {dialog.kind === "rename" ? <RenameForm sessionId={dialog.sessionId} onDone={close} /> : null}
        {dialog.kind === "command" ? <CommandForm onDone={close} /> : null}
        {dialog.kind === "appearance" ? <AppearanceForm sessionId={dialog.sessionId} onDone={close} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function RenameForm({ sessionId, onDone }: { sessionId: string; onDone: () => void }) {
  const session = useTerminalSessionStore((s) => s.sessions.find((x) => x.id === sessionId));
  const rename = useTerminalSessionStore((s) => s.renameSession);
  const [title, setTitle] = useState(session?.title ?? "");
  function submit(event: FormEvent) {
    event.preventDefault();
    rename(sessionId, title);
    onDone();
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <DialogTitle>Rename Tab</DialogTitle>
      <DialogDescription>Titles and folders identify terminals; color alone never does.</DialogDescription>
      <Input autoFocus aria-label="Terminal title" value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
        <Button type="submit" disabled={!title.trim()}>Rename</Button>
      </div>
    </form>
  );
}

function CommandForm({ onDone }: { onDone: () => void }) {
  const [command, setCommand] = useState("");
  function submit(event: FormEvent) {
    event.preventDefault();
    const line = command;
    onDone();
    void shellNewCommand(line);
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <DialogTitle>New Command</DialogTitle>
      <DialogDescription>Opens a new terminal tab and runs this command in it.</DialogDescription>
      <Input autoFocus aria-label="Command" className="font-mono" placeholder="npm run dev" value={command} onChange={(e) => setCommand(e.target.value)} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
        <Button type="submit" disabled={!command.trim()}>Run</Button>
      </div>
    </form>
  );
}

function AppearanceForm({ sessionId, onDone }: { sessionId: string; onDone: () => void }) {
  const session = useTerminalSessionStore((s) => s.sessions.find((x) => x.id === sessionId));
  const appearance = useSessionAppearance(sessionId);
  const defaultProfileId = useTerminalAppearanceStore((s) => s.defaultProfileId);
  const patch = useTerminalAppearanceStore((s) => s.patchSession);
  const setProfile = useTerminalAppearanceStore((s) => s.setProfile);
  const setDefaultProfile = useTerminalAppearanceStore((s) => s.setDefaultProfile);
  const [hexDraft, setHexDraft] = useState(appearance.theme.background);
  useEffect(() => setHexDraft(appearance.theme.background), [appearance.theme.background]);
  const lowContrast = appearance.contrast < MIN_CONTRAST_RATIO;
  const label = `${session?.title ?? "Terminal"}${session?.cwd ? ` · ${session.cwd}` : ""}`;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <DialogTitle>Terminal Appearance</DialogTitle>
        <DialogDescription>{label}. Changes apply to this terminal only.</DialogDescription>
      </div>

      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Profile
        <select
          className="h-9 rounded-md bg-muted px-2 text-sm text-foreground"
          value={appearance.profileId}
          onChange={(e) => setProfile(sessionId, e.target.value as (typeof TERMINAL_PROFILES)[number]["id"])}
        >
          {TERMINAL_PROFILES.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.label}{profile.id === defaultProfileId ? " (default)" : ""} — {profile.hint}
            </option>
          ))}
        </select>
      </label>

      <div className="flex items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Background
          <input
            type="color"
            aria-label="Background color"
            className="h-9 w-14 cursor-pointer rounded-md bg-muted p-1"
            value={appearance.theme.background}
            onChange={(e) => patch(sessionId, { background: e.target.value })}
          />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-xs text-muted-foreground">
          Hex
          <Input
            aria-label="Background hex"
            className="h-9 font-mono"
            value={hexDraft}
            onChange={(e) => {
              setHexDraft(e.target.value);
              const hex = normalizeHex(e.target.value);
              if (hex) patch(sessionId, { background: hex });
            }}
          />
        </label>
        <div
          aria-hidden
          className="grid h-9 min-w-24 place-items-center rounded-md font-mono text-xs"
          style={{ background: appearance.theme.background, color: appearance.theme.foreground }}
        >
          $ ls
        </div>
      </div>
      <p role="status" className={lowContrast ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
        Text contrast {appearance.contrast.toFixed(1)}:1
        {lowContrast ? ` — below ${MIN_CONTRAST_RATIO}:1; the terminal raises low-contrast cells automatically.` : " — meets WCAG AA."}
      </p>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Font size · {appearance.fontSize}px
          <input
            type="range"
            min={FONT_SIZE_RANGE.min}
            max={FONT_SIZE_RANGE.max}
            step={0.5}
            value={appearance.fontSize}
            onChange={(e) => patch(sessionId, { fontSize: Number(e.target.value) })}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Line height · {appearance.lineHeight.toFixed(2)}
          <input
            type="range"
            min={LINE_HEIGHT_RANGE.min}
            max={LINE_HEIGHT_RANGE.max}
            step={0.05}
            value={appearance.lineHeight}
            onChange={(e) => patch(sessionId, { lineHeight: Number(e.target.value) })}
          />
        </label>
      </div>

      <div className="flex flex-wrap justify-between gap-2">
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => shellResetAppearance()}>Reset</Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setDefaultProfile(resolveSessionAppearance(sessionId).profileId)}
          >
            Use profile as default
          </Button>
        </div>
        <Button type="button" size="sm" onClick={onDone}>Done</Button>
      </div>
    </div>
  );
}

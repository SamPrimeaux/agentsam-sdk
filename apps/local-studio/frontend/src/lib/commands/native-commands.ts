/**
 * Command registry shared by the native menu, the command palette, and keyboard
 * shortcuts. A command id is the single contract:
 *
 *   native menu item id  ──┐
 *   palette item           ├─► runCommand(id) ─► handler registered by the bridge
 *   web shortcut (accel)  ──┘
 *
 * Pure module (no app imports) so it is unit-testable and importable anywhere.
 * Rust side: `packages/agentsam-desktop-shell/src-tauri/src/menu.rs` emits
 * `agentsam://native-menu` with `{ v: 1, command }`.
 */
export const NATIVE_MENU_EVENT = "agentsam://native-menu";
export const NATIVE_COLOR_EVENT = "agentsam://native-color";
export const CHECK_UPDATE_EVENT = "agentsam://check-update-requested";

export type CommandGroup = "App" | "File" | "View" | "Shell" | "Help";

export type CommandSpec = {
  id: string;
  title: string;
  group: CommandGroup;
  /** Web/keyboard fallback accelerator; mirrors the native menu accelerator. `mod` = ⌘ or Ctrl. */
  accel?: string;
  /** Offered in the command palette. */
  palette?: boolean;
};

export const COMMANDS: readonly CommandSpec[] = [
  { id: "chat.new", title: "New Chat", group: "File", accel: "mod+n", palette: true },
  { id: "project.new", title: "New Project…", group: "File", palette: true },
  { id: "folder.open_in_terminal", title: "Open Folder in Terminal…", group: "File", accel: "mod+shift+o", palette: true },
  { id: "settings.open", title: "Settings…", group: "App", accel: "mod+,", palette: true },
  { id: "app.check_updates", title: "Check for Updates…", group: "App", palette: true },
  { id: "app.cache_deleted", title: "Local cache deleted", group: "App" },
  { id: "app.cache_delete_failed", title: "Local cache deletion failed", group: "App" },
  { id: "view.toggle_terminal", title: "Toggle Bottom Panel", group: "View", accel: "mod+j", palette: true },
  { id: "view.open_terminal", title: "Open Terminal", group: "View", palette: true },
  { id: "view.open_browser", title: "Open Browser Tab", group: "View", palette: true },
  { id: "runtime.open", title: "Troubleshooting", group: "Help", palette: true },
  { id: "runtime.open_status", title: "System Status", group: "Help", palette: true },
  { id: "shell.new_terminal", title: "New Terminal", group: "Shell", accel: "mod+alt+t", palette: true },
  { id: "shell.new_tab", title: "New Tab", group: "Shell", accel: "mod+t", palette: true },
  { id: "shell.new_command", title: "New Command…", group: "Shell", palette: true },
  { id: "shell.new_remote", title: "New Remote Connection…", group: "Shell", palette: true },
  { id: "shell.close_tab", title: "Close Tab", group: "Shell", accel: "mod+alt+w", palette: true },
  { id: "shell.rename_tab", title: "Rename Tab…", group: "Shell", palette: true },
  { id: "shell.prev_tab", title: "Select Previous Tab", group: "Shell", accel: "mod+alt+arrowleft", palette: true },
  { id: "shell.next_tab", title: "Select Next Tab", group: "Shell", accel: "mod+alt+arrowright", palette: true },
  { id: "shell.profile.cms", title: "Use Profile: Theme Default", group: "Shell", palette: true },
  { id: "shell.profile.local", title: "Use Profile: Local", group: "Shell", palette: true },
  { id: "shell.profile.remote", title: "Use Profile: Remote", group: "Shell", palette: true },
  { id: "shell.profile.sandbox", title: "Use Profile: Sandbox", group: "Shell", palette: true },
  { id: "shell.use_profile_default", title: "Use Profile as Default", group: "Shell", palette: true },
  { id: "shell.edit_background_color", title: "Edit Background Color…", group: "Shell", palette: true },
  { id: "shell.appearance", title: "Terminal Appearance…", group: "Shell", palette: true },
  { id: "shell.reset_appearance", title: "Reset Appearance", group: "Shell", palette: true },
  { id: "shell.clear_scrollback", title: "Clear Scrollback", group: "Shell", accel: "mod+alt+k", palette: true },
  { id: "shell.open_workspace", title: "Open Terminal Workspace", group: "Shell", palette: true },
];

export const COMMAND_IDS = new Set(COMMANDS.map((command) => command.id));

export type CommandHandler = (args?: Record<string, unknown>) => void | Promise<void>;

const handlers = new Map<string, CommandHandler>();
const lastRun = new Map<string, number>();

/** Menu accelerator + web fallback can both deliver one keypress; collapse it to one run. */
export const DUPLICATE_WINDOW_MS = 250;

export function registerCommandHandlers(map: Record<string, CommandHandler>): () => void {
  const owned = Object.entries(map);
  for (const [id, handler] of owned) handlers.set(id, handler);
  return () => {
    for (const [id, handler] of owned) if (handlers.get(id) === handler) handlers.delete(id);
  };
}

export function hasCommand(id: string): boolean {
  return handlers.has(id);
}

export type RunResult = "ran" | "unknown" | "unhandled" | "duplicate";

export async function runCommand(id: string, args?: Record<string, unknown>, now = Date.now()): Promise<RunResult> {
  if (!COMMAND_IDS.has(id)) return "unknown";
  const handler = handlers.get(id);
  if (!handler) return "unhandled";
  const previous = lastRun.get(id);
  if (previous !== undefined && now - previous < DUPLICATE_WINDOW_MS) return "duplicate";
  lastRun.set(id, now);
  await handler(args);
  return "ran";
}

export function resetCommandRegistryForTests() {
  handlers.clear();
  lastRun.clear();
}

/** Accepts the v1 contract `{ v: 1, command }`; rejects anything else (including bare strings). */
export function parseMenuPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const { v, command } = payload as { v?: unknown; command?: unknown };
  if (v !== 1 || typeof command !== "string" || !command) return null;
  return command;
}

export type KeyLike = {
  key: string;
  code?: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
};

/** Match `mod+alt+t`-style accelerators. Letters use `code` so ⌥ (which rewrites `key`) still matches. */
export function matchAccelerator(event: KeyLike, accel: string): boolean {
  const parts = accel.toLowerCase().split("+");
  const key = parts[parts.length - 1]!;
  const wantMod = parts.includes("mod");
  const wantAlt = parts.includes("alt");
  const wantShift = parts.includes("shift");
  if (wantMod !== (event.metaKey || event.ctrlKey)) return false;
  if (wantAlt !== event.altKey || wantShift !== event.shiftKey) return false;
  if (/^[a-z]$/.test(key)) return event.code ? event.code === `Key${key.toUpperCase()}` : event.key.toLowerCase() === key;
  if (key.startsWith("arrow")) return event.key.toLowerCase() === key;
  return event.key.toLowerCase() === key;
}

export function commandForKeyEvent(event: KeyLike): string | null {
  for (const command of COMMANDS) {
    if (command.accel && matchAccelerator(event, command.accel)) return command.id;
  }
  return null;
}

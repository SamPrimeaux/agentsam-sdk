import { useEffect } from "react";
import { toast } from "sonner";
import { TerminalDialogs } from "@/components/workbench/terminal-dialogs";
import {
  CHECK_UPDATE_EVENT,
  NATIVE_COLOR_EVENT,
  NATIVE_MENU_EVENT,
  commandForKeyEvent,
  parseMenuPayload,
  registerCommandHandlers,
  runCommand,
} from "@/lib/commands/native-commands";
import { getTauriInvoke, getTauriWindowLabel, isPackagedDesktop, listenTauriEvent } from "@/lib/desktop/tauri";
import { navigateApp } from "@/lib/work/navigate";
import { useWorkStore } from "@/lib/work/store";
import { applySessionBackground, type TerminalProfileId } from "@/lib/work/terminal-appearance";
import * as shell from "@/lib/work/terminal-commands";

/** Check/install go through the one updater command pair in the desktop shell. */
async function checkForUpdates() {
  const invoke = getTauriInvoke();
  if (!invoke) {
    toast("Updates are delivered by the desktop app.");
    return;
  }
  try {
    const available = Boolean(await invoke("check_for_update", {}));
    if (!available) {
      toast("AgentSam is up to date.");
      return;
    }
    toast("An update is available.", {
      duration: 30000,
      action: {
        label: "Install & Restart",
        onClick: () => {
          toast("Downloading update…");
          invoke("install_update", {}).catch((error) => toast.error(`Update failed: ${String(error)}`));
        },
      },
    });
  } catch (error) {
    toast.error(`Update check failed: ${String(error)}`);
  }
}

async function openFolderInTerminal() {
  const invoke = getTauriInvoke();
  if (!invoke) {
    toast("Open Folder in Terminal needs the desktop app to browse your disk.");
    return;
  }
  try {
    const picked = (await invoke("local_sqlite_pick_directory", {})) as string | null;
    if (!picked) return;
    const name = picked.split("/").filter(Boolean).pop() ?? picked;
    shell.shellNewTerminal({ cwd: picked, title: name });
  } catch (error) {
    toast.error(`Could not open folder: ${String(error)}`);
  }
}

function isAddressedToThisWindow(payload: unknown): boolean {
  const target = (payload as { window?: unknown } | null)?.window;
  if (typeof target !== "string" || !target) return true;
  const own = getTauriWindowLabel();
  return !own || own === target;
}

/**
 * The single frontend consumer of native commands. Registers handlers for the
 * shared command registry, relays `agentsam://native-menu`, answers the tray's
 * check-update request, applies live colors from the native color panel, and
 * provides the web keyboard fallback for the same command ids.
 */
export function NativeCommandBridge() {
  useEffect(() => {
    const profile = (id: TerminalProfileId) => () => shell.shellSetProfile(id);
    const unregister = registerCommandHandlers({
      "chat.new": () => {
        useWorkStore.getState().startTrail();
        navigateApp("/admin/agentsam");
      },
      "project.new": () => {
        useWorkStore.getState().createProject();
        navigateApp("/projects");
      },
      "folder.open_in_terminal": openFolderInTerminal,
      "settings.open": () => navigateApp("/settings/general"),
      "runtime.open": () => navigateApp("/settings/runtime"),
      "runtime.open_status": () => navigateApp("/settings/runtime"),
      "app.check_updates": checkForUpdates,
      "app.cache_deleted": () => void toast("Local cache deleted. Projects, files, sessions, and credentials were kept."),
      "app.cache_delete_failed": () => void toast.error("Local cache could not be deleted."),
      "view.toggle_terminal": () => useWorkStore.getState().toggleTerminal(),
      "view.open_terminal": () => shell.ensureTerminalVisible(),
      "view.open_browser": () => navigateApp("/browse"),
      "shell.new_terminal": () => void shell.shellNewTerminal(),
      "shell.new_tab": () => void shell.shellNewTab(),
      "shell.new_command": shell.shellPromptCommand,
      "shell.new_remote": () => navigateApp("/settings/runtime"),
      "shell.close_tab": shell.shellCloseTab,
      "shell.rename_tab": shell.shellRenameTab,
      "shell.prev_tab": () => shell.shellCycleTab(-1),
      "shell.next_tab": () => shell.shellCycleTab(1),
      "shell.profile.cms": profile("cms"),
      "shell.profile.local": profile("local"),
      "shell.profile.remote": profile("remote"),
      "shell.profile.sandbox": profile("sandbox"),
      "shell.use_profile_default": shell.shellUseProfileAsDefault,
      "shell.edit_background_color": shell.shellEditBackgroundColor,
      "shell.appearance": shell.shellOpenAppearance,
      "shell.reset_appearance": shell.shellResetAppearance,
      "shell.clear_scrollback": shell.shellClearScrollback,
      "shell.open_workspace": shell.shellOpenWorkspace,
    });

    function onKey(event: KeyboardEvent) {
      const id = commandForKeyEvent(event);
      if (!id) return;
      event.preventDefault();
      void runCommand(id);
    }
    window.addEventListener("keydown", onKey);

    let cancelled = false;
    const stops: Array<() => void> = [];
    if (isPackagedDesktop()) {
      // Native events are broadcast with the target window label (see menu.rs);
      // ignore the ones addressed to another window.
      const attach = async <T,>(event: string, handler: (payload: T) => void) => {
        const stop = await listenTauriEvent<T>(event, (e) => {
          if (!isAddressedToThisWindow(e.payload)) return;
          handler(e.payload);
        });
        if (!stop) return;
        if (cancelled) stop();
        else stops.push(stop);
      };
      const ack = (note: string) => {
        const invoke = getTauriInvoke();
        if (invoke) void Promise.resolve(invoke("native_selftest_ack", { note })).catch(() => {});
      };
      void attach<unknown>(NATIVE_MENU_EVENT, (payload) => {
        const command = parseMenuPayload(payload);
        if (command) {
          void runCommand(command).then(
            (result) => ack(`${command} -> ${result}`),
            (error) => ack(`${command} threw ${String(error)}`),
          );
        } else console.warn("[native-menu] ignored malformed payload", payload);
      });
      ack(`bridge listening in window ${getTauriWindowLabel() ?? "?"}`);
      void attach<unknown>(CHECK_UPDATE_EVENT, () => void runCommand("app.check_updates"));
      void attach<{ sessionId?: string; hex?: string }>(NATIVE_COLOR_EVENT, (payload) => {
        if (payload?.sessionId && payload.hex) applySessionBackground(payload.sessionId, payload.hex);
      });
    }

    return () => {
      cancelled = true;
      unregister();
      window.removeEventListener("keydown", onKey);
      for (const stop of stops) stop();
    };
  }, []);

  return <TerminalDialogs />;
}

import { useEffect, useState } from "react";
import { loadCompanionSettings } from '../../../agentsam/companion-client';
import { companionStateAsset, resolveCompanion } from '../../../agentsam/companions';
import type { CompanionProfile } from '../../../agentsam/companions';
import { emitTauriEvent, getTauriInvoke, listenTauriEvent } from "@/lib/desktop/tauri";

type PetState = "idle" | "working";
export function AgentSamPetWindow() {
  const [state, setState] = useState<PetState>("idle");
  const [companion, setCompanion] = useState<CompanionProfile>(() => resolveCompanion('geaux'));
  useEffect(() => {
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        (window as Window & { __AGENTSAM_DESKTOP_SHELL_READY__?: boolean }).__AGENTSAM_DESKTOP_SHELL_READY__ = true;
        window.dispatchEvent(new Event('agentsam:desktop-shell-ready'));
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, []);
  useEffect(() => {
    let active = true;
    let dispose: (() => void) | undefined;
    const refresh = () => void loadCompanionSettings().then((settings) => {
      if (active) setCompanion(resolveCompanion(settings.activeId, settings.customCompanions));
    }).catch(() => {});
    refresh();
    window.addEventListener('agentsam:companions-changed', refresh);
    void listenTauriEvent('agentsam:companions:changed', refresh).then((unlisten) => {
      if (!unlisten) return;
      if (active) dispose = unlisten;
      else unlisten();
    }).catch(() => {});
    return () => { active = false; dispose?.(); window.removeEventListener('agentsam:companions-changed', refresh); };
  }, []);
  useEffect(() => {
    document.documentElement.classList.add("agentsam-pet-window");
    return () => document.documentElement.classList.remove("agentsam-pet-window");
  }, []);
  useEffect(() => {
    let active = true;
    let dispose: (() => void) | undefined;
    void listenTauriEvent<{ state?: string }>("agentsam:pet:state", (event) => {
      if (!active) return;
      if (event.payload?.state === "working" || event.payload?.state === "idle") setState(event.payload.state);
    }).then((unlisten) => {
      if (!unlisten) return;
      if (active) dispose = unlisten;
      else unlisten();
    }).catch(() => {});
    return () => { active = false; dispose?.(); };
  }, []);
  async function openAgentSam() {
    const invoke = getTauriInvoke();
    try { await invoke?.("focus_main_window", {}); } catch { /* Navigation can still succeed if focus fails. */ }
    try { await emitTauriEvent("agentsam:pet:activate", { source: "desktop-pet" }); }
    catch { /* The pet remains available if the main window is temporarily unavailable. */ }
  }
  async function closePet() {
    const invoke = getTauriInvoke();
    if (!invoke) return;
    try { await invoke("close_agent_sam_pet", {}); } catch {}
  }
  const image = companionStateAsset(companion, state) || (companion.builtIn
    ? companion.avatarUrl || "/brand/agentsam-gorilla/v1/pet/animated/ledge-idle.gif"
    : companion.avatarUrl);
  return <main className="agentsam-desktop-pet" aria-label="AgentSam desktop pet" data-state={state}>
    <div className="agentsam-desktop-pet-handle">
      <span data-tauri-drag-region title="Drag to move AgentSam">AgentSam</span>
      <button type="button" onClick={() => void closePet()} aria-label="Hide desktop pet" title="Hide pet">×</button>
    </div>
    <button type="button" className="agentsam-desktop-pet-sprite" onClick={() => void openAgentSam()} aria-label="Open AgentSam assistant in current workspace" title="Ask AgentSam in current workspace">
      {image ? <img src={image} alt={`${companion.name} ${state === "working" ? "is working" : "is ready"}`} draggable={false} />
        : <span className="agentsam-desktop-pet-initial" aria-hidden="true">{companion.name.slice(0, 1).toUpperCase()}</span>}
      <span className="agentsam-desktop-pet-helper">Ask AgentSam</span>
    </button>
  </main>;
}

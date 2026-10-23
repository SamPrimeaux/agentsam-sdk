import { useEffect, useState } from "react";
import { emitTauriEvent, getTauriInvoke, listenTauriEvent } from "@/lib/desktop/tauri";

type PetState = "idle" | "working";
const PET_ASSETS: Record<PetState, string> = {
  idle: "/brand/agentsam-gorilla/v1/pet/animated/ledge-idle.gif",
  working: "/brand/agentsam-gorilla/v1/pet/animated/ledge-working.gif",
};

export function AgentSamPetWindow() {
  const [state, setState] = useState<PetState>("idle");
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
  return <main className="agentsam-desktop-pet" aria-label="AgentSam desktop pet" data-state={state}>
    <div className="agentsam-desktop-pet-handle">
      <span data-tauri-drag-region title="Drag to move AgentSam">AgentSam</span>
      <button type="button" onClick={() => void closePet()} aria-label="Hide desktop pet" title="Hide pet">×</button>
    </div>
    <button type="button" className="agentsam-desktop-pet-sprite" onClick={() => void openAgentSam()} aria-label="Open AgentSam chat" title="Open AgentSam chat">
      <img src={PET_ASSETS[state]} alt={state === "working" ? "AgentSam is working" : "AgentSam is idle"} draggable={false} />
    </button>
  </main>;
}

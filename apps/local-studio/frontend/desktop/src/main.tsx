import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createHashHistory, RouterProvider } from "@tanstack/react-router";
import { getRouter } from "../../src/router";
import { AgentSamPetWindow } from "../../src/components/desktop/AgentSamPetWindow";
import { getTauriWindowLabel } from "../../src/lib/desktop/tauri";
import "../../src/styles.css";

declare global {
  interface Window {
    __AGENTSAM_DESKTOP__?: boolean;
    __AGENTSAM_DESKTOP_BOOT_GUARD__?: number;
  }
}

window.__AGENTSAM_DESKTOP__ = true;
const isAgentSamPetWindow = new URLSearchParams(window.location.search).get("window") === "agent-sam-pet" || getTauriWindowLabel() === "agent-sam-pet";
if (isAgentSamPetWindow) {
  document.documentElement.classList.add("agentsam-pet-window");
} else if (!window.location.hash || window.location.hash === "#/") {
  window.location.hash = "#/agentsam";
}
const root = document.getElementById("root");
if (!root) throw new Error("desktop_root_missing");
if (isAgentSamPetWindow) {
  createRoot(root).render(<StrictMode><AgentSamPetWindow /></StrictMode>);
} else {
  const router = getRouter({ history: createHashHistory() });
  createRoot(root).render(<StrictMode><RouterProvider router={router} /></StrictMode>);
}

if (window.__AGENTSAM_DESKTOP_BOOT_GUARD__) {
  window.clearTimeout(window.__AGENTSAM_DESKTOP_BOOT_GUARD__);
}

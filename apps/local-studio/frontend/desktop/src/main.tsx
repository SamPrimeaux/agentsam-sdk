import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createHashHistory, RouterProvider } from "@tanstack/react-router";
import { getRouter } from "../../src/router";
import "../../src/styles.css";

declare global {
  interface Window {
    __AGENTSAM_DESKTOP__?: boolean;
  }
}

window.__AGENTSAM_DESKTOP__ = true;
if (!window.location.hash || window.location.hash === "#/") {
  window.location.hash = "#/agentsam";
}

const router = getRouter({ history: createHashHistory() });
const root = document.getElementById("root");
if (!root) throw new Error("desktop_root_missing");

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, MemoryRouter } from "react-router-dom";
import App from "./App";
import "./styles/analytics.css";
import "./styles/analytics-shell.css";
import "./index.css";

// An installed native host opens the real packaged file, not a fictitious
// /admin clean URL. The host supplies its validated product route explicitly.
const bundledRoute = new URLSearchParams(window.location.search).get('__route');
const installedRoute = window.parent !== window && bundledRoute &&
  /^\/(products\/(create(?:\/[a-zA-Z0-9_-]+)?|help\/artwork)|analytics\/(overview|finance|health)|account)$/.test(bundledRoute)
  ? bundledRoute : null;

window.renderShell(
  installedRoute ? '/admin' + installedRoute : window.location.pathname,
  '<div id="ecommerce-react-content"></div>',
  { fullBleed: true },
);

const host = document.getElementById("ecommerce-react-content");
if (!host) throw new Error("Admin shell did not create the React content mount");

createRoot(host).render(
  <StrictMode>
    {installedRoute ? <MemoryRouter initialEntries={[installedRoute]}><App /></MemoryRouter> : <BrowserRouter basename="/admin"><App /></BrowserRouter>}
  </StrictMode>,
);

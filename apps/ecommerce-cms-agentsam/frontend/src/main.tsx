import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles/analytics.css";
import "./styles/analytics-shell.css";
import "./index.css";

window.renderShell(
  window.location.pathname,
  '<div id="ecommerce-react-content"></div>',
  { fullBleed: true },
);

const host = document.getElementById("ecommerce-react-content");
if (!host) throw new Error("Admin shell did not create the React content mount");

createRoot(host).render(
  <StrictMode>
    <BrowserRouter basename="/admin">
      <App />
    </BrowserRouter>
  </StrictMode>,
);

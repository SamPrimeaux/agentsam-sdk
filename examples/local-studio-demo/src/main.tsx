import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { ContentRuntime } from "@inneranimalmedia/agentsam-content";
import { ContentStudio, tokens } from "@inneranimalmedia/agentsam-content-studio";
import { buildDemoRuntime } from "./seed.js";

function App() {
  const [runtime, setRuntime] = useState<ContentRuntime | null>(null);

  useEffect(() => {
    void buildDemoRuntime().then(setRuntime);
  }, []);

  if (!runtime) {
    return (
      <div style={{ height: "100vh", display: "grid", placeItems: "center", color: "#8b91a3", fontFamily: "system-ui" }}>
        Seeding Local Studio runtime…
      </div>
    );
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <header
        style={{
          padding: "10px 16px",
          borderBottom: `1px solid ${tokens.border}`,
          background: tokens.panel,
          color: tokens.text,
          fontFamily: "system-ui",
          display: "flex",
          alignItems: "baseline",
          gap: 10,
        }}
      >
        <b>AgentSam Content Studio</b>
        <span style={{ color: tokens.textDim, fontSize: 13 }}>
          host: Local Studio · account: acct_local_studio · providers: local
        </span>
      </header>
      <div style={{ flex: 1, minHeight: 0 }}>
        <ContentStudio runtime={runtime} />
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

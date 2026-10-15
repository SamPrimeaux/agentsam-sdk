import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { createFixtureWorkHost, populatedWorkFixture } from "../src/fixtures/index";
import { WorkProduct } from "../src/frontend/WorkProduct";
import "../src/frontend/theme.css";

function StudioFixture() {
  const host = useMemo(() => createFixtureWorkHost(populatedWorkFixture), []);
  const [path,setPath] = useState("/projects");
  const id = path.startsWith("/projects/") ? decodeURIComponent(path.slice("/projects/".length)) : undefined;
  const navigate=(next:string)=>setPath(next);
  return <WorkProduct host={host} onNavigate={navigate} surface={id ? "project-detail" : "projects"}
    projectId={id} presentation="standalone"/>;
}
createRoot(document.getElementById("root")!).render(<StudioFixture/>);

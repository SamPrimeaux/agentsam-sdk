import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DesignWorkspaceFrame } from "../dist/design/index.js";

const base = {
  contract: "agentsam.design-workspace.v1",
  resource: {
    id: "cad-1",
    kind: "cad",
    appId: "cad-creator",
    title: "Dimensioned floor plan",
    href: "/cad/cad-1/workspace",
    accountId: "a",
  },
  capabilities: ["open", "select", "inspect", "save"],
  revision: "r2",
  savedRevision: "r1",
  dirty: true,
  selection: [],
  status: "ready",
};

test("workbench frame retains native stage and never renders generic artboards", () => {
  const html = renderToStaticMarkup(
    createElement(
      DesignWorkspaceFrame,
      {
        snapshot: base,
        explorer: createElement("p", null, "Native object tree"),
        inspector: createElement("p", null, "Native geometry properties"),
        assistant: createElement("p", null, "Contextual assistant"),
        commands: createElement("button", null, "Domain tool"),
        status: createElement("span", null, "CAD engine live"),
      },
      createElement(
        "div",
        { "data-testid": "native-occt" },
        "Native CAD viewport",
      ),
    ),
  );
  assert.match(html, /data-design-kind="cad"/);
  assert.match(html, /data-design-app="cad-creator"/);
  assert.match(html, /Native CAD viewport/);
  assert.match(html, /Native geometry properties/);
  assert.match(html, /Domain tool/);
  assert.match(html, /Unsaved changes/);
  assert.doesNotMatch(html, /generic-artboard|iframe|model-viewer/);
});

test("different specialist engines enter identical shell contract without being flattened", () => {
  const html = renderToStaticMarkup(
    createElement(
      DesignWorkspaceFrame,
      {
        snapshot: {
          ...base,
          resource: {
            ...base.resource,
            id: "movie-1",
            kind: "movie",
            appId: "agentsam-copro-studio",
            title: "Cut",
          },
          dirty: false,
        },
        assistantOpen: false,
        assistant: createElement("p", null, "Agent"),
      },
      createElement(
        "div",
        { "data-testid": "timeline" },
        "Native MovieMode timeline",
      ),
    ),
  );
  assert.match(html, /data-design-kind="movie"/);
  assert.match(html, /Native MovieMode timeline/);
  assert.match(html, /Open assistant/);
  assert.doesNotMatch(html, /Contextual AgentSam assistant/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = readFileSync(resolve(import.meta.dirname, "../frontend/src/routes/__root.tsx"), "utf8");
const shell = readFileSync(resolve(import.meta.dirname, "../frontend/agentsam/AgentSamShell.tsx"), "utf8");
const chat = readFileSync(resolve(import.meta.dirname, "../frontend/agentsam/AgentSamPage.tsx"), "utf8");

// The shell is created only once its packaged HTML host exists. Route-level
// bridges and independently mounted pages must still have a tooltip context.
test("RootDocument supplies tooltips before route bridges and the app outlet", () => {
  assert.match(root, /import \{ TooltipProvider \} from ["']@\/components\/ui\/tooltip["']/);
  const start = root.indexOf("<TooltipProvider>", root.indexOf("function RootDocument()"));
  const end = root.indexOf("</TooltipProvider>", start);
  assert.ok(start >= 0 && end > start, "the root tooltip boundary must exist");
  const children = root.slice(start, end);
  for (const child of ["PreviewHostBridge", "ConnectionDeepLinkBridge", "OpenWorkspaceDeepLinkBridge", "NativeCommandBridge", "AuthProvider", "ApplicationOutlet"]) {
    assert.ok(children.includes("<" + child), child + " must be inside the root provider");
  }
});

test("the shared shell retains local tooltip ownership for independent embedding", () => {
  assert.match(shell, /<TooltipProvider><Nav\.Provider/);
  assert.match(shell, /<Outlet \/>/);
  assert.match(chat, /<IconAction/);
});

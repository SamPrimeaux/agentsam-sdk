import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

test("only Chats routes are registered, without trails fallbacks or redirects", () => {
  const tree = read("frontend/src/routeTree.gen.ts");
  assert.match(tree, /\/chats\/\$chatId/);
  assert.match(tree, /\/chats/);
  assert.doesNotMatch(tree, /\/trails\b/);
  assert.ok(!existsSync(resolve(root, "frontend/src/routes/(apps)/trails")));
  assert.ok(!existsSync(resolve(root, "frontend/src/routes/_app/trails")));
  assert.ok(existsSync(resolve(root, "frontend/src/routes/(apps)/chats/$chatId.tsx")));
  assert.ok(existsSync(resolve(root, "frontend/src/routes/(apps)/chats/index.tsx")));
  assert.match(read("frontend/src/components/shell/nav-rail.tsx"), /to: "\/chats", label: "Chats"/);
  assert.match(read("frontend/src/components/shell/ChatsIndex.tsx"), /<Link to="\/projects"/);
  assert.match(read("frontend/agentsam/AgentSamPage.tsx"), /<Link to="\/chats"/);
});

test("Work project chat association reuses persisted Studio chats, not IAM", () => {
  const shared = read("shared/agentsam/src/work-types.ts");
  const store = read("frontend/src/lib/work/store.ts");
  const links = read("frontend/src/lib/work/project-chat-links.ts");
  const panel = read("frontend/src/components/work/LocalStudioWorkPage.tsx");
  assert.match(shared, /workProjectId\?: string/);
  assert.match(store, /assignChatToWorkProject/);
  assert.match(store, /\{\s*\.\.\.chat, workProjectId: id, updatedAt: Date\.now\(\)/);
  assert.match(links, /filter\(\(chat\) => chat\.workProjectId === projectId\)/);
  assert.match(links, /assignChatToWorkProject\(chatId, projectId\)/);
  assert.match(links, /startTrail\(\)/);
  assert.match(panel, /localStudioProjectChats/);
  assert.doesNotMatch(links, /\/api\/agent\/sessions|createWorkChats|fetch\(/);
});

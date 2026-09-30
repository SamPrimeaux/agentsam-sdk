import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("LocalStudioWorkPage defaults to HTTP WorkHost, not populated fixture", () => {
  const source = readFileSync(
    join(root, "apps/local-studio/frontend/src/components/work/LocalStudioWorkPage.tsx"),
    "utf8",
  );
  assert.match(source, /createHttpWorkHost/);
  assert.match(source, /resolveWorkHostMode/);
  assert.match(source, /VITE_WORK_FIXTURE/);
  // Fixture must be opt-in only
  assert.match(source, /fixture === "populated"/);
  assert.doesNotMatch(
    source,
    /createFixtureWorkHost\(populatedWorkFixture\)\s*,\s*\[\s*\]/,
  );
});

test("agentsam-work theme does not hardcode Inter", () => {
  const css = readFileSync(
    join(root, "packages/agentsam-work/src/frontend/theme.css"),
    "utf8",
  );
  assert.doesNotMatch(css, /font-family:\s*Inter/);
  assert.match(css, /--font-sans/);
});

test("worker mounts /api/work/snapshot", () => {
  const index = readFileSync(
    join(root, "apps/local-studio/backend/worker/index.js"),
    "utf8",
  );
  const service = readFileSync(
    join(root, "apps/local-studio/backend/worker/work-service.js"),
    "utf8",
  );
  assert.match(index, /handleWorkRequest/);
  assert.match(service, /\/api\/work\/snapshot/);
  assert.match(service, /fixtureName: 'live'/);
  assert.doesNotMatch(service, /Companions of CPAS|AgentSamRemix|runtime-receipts\.md/);
});

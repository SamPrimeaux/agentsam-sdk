import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { execFileSync } from "node:child_process";
import {
  inferScope, labelsForIssueOpen, labelsForPullRequest,
  labelNames, manifest, validateLabelManifest,
} from "../../scripts/github/label-policy.mjs";

const ROOT = process.cwd();
test("machine-readable catalog is unique, governed and contains required dimensions", () => {
  assert.equal(validateLabelManifest(), 40);
  for (const type of ["type:", "priority:", "status:", "scope:", "size:"]) {
    assert.ok(manifest.labels.some((item) => item.name.startsWith(type)), type);
  }
  assert.ok(labelNames.has("good first issue"));
  assert.ok(labelNames.has("help wanted"));
  assert.ok(labelNames.has("wontfix"));
  assert.ok(labelNames.has("duplicate"));
});

test("new issues get needs-triage, preserving any maintainer-selected status", () => {
  assert.deepEqual(labelsForIssueOpen(["type: bug"]), ["status: needs-triage"]);
  assert.deepEqual(labelsForIssueOpen(["status: blocked"]), []);
});

test("PR scope discovery does not guess severity, type or cross-component ownership", () => {
  assert.equal(inferScope(["apps/agentsam-go-worker/runtime/pty.go"]), "scope: daemon");
  assert.equal(inferScope(["scripts/build-sea.mjs"]), "scope: release");
  assert.deepEqual(labelsForPullRequest(["packages/copro-ui/src/studio.tsx"]), ["scope: media"]);
  assert.deepEqual(labelsForPullRequest(["docs/README.md", "packages/copro-ui/src/studio.tsx"]), []);
  assert.deepEqual(labelsForPullRequest(["scripts/build-sea.mjs"], ["scope: cli"]), []);
  assert.deepEqual(labelsForPullRequest(["random/unknown.asset"]), []);
});

test("label dry-run needs no network, secrets or GitHub CLI", () => {
  const output = execFileSync(process.execPath, [
    "scripts/github/sync-labels.mjs", "--dry-run",
  ], { cwd: ROOT, encoding: "utf8", env: { PATH: process.env.PATH } });
  assert.match(output, /40 definitions/);
  assert.match(output, /no API requests and no mutations/);
});

test("workflows operate on trusted base checkout; never apply guessed priority", () => {
  const flow = readFileSync(join(ROOT, ".github/workflows/github-governance.yml"), "utf8");
  assert.match(flow, /pull_request_target:/);
  assert.match(flow, /default_branch/);
  assert.match(flow, /persist-credentials: false/);
  assert.doesNotMatch(flow, /github\.event\.pull_request\.head\.sha/);
  const triage = readFileSync(join(ROOT, "scripts/github/triage.mjs"), "utf8");
  assert.doesNotMatch(triage, /priority: p[0-3]/);
  assert.doesNotMatch(triage, /child_process|exec\(/);
});

test("distribution tasks have stable labels, safe status and an acyclic dependency graph", () => {
  const plan = JSON.parse(readFileSync(join(ROOT, "protocol/governance/distribution-roadmap.v1.json"), "utf8"));
  assert.equal(plan.schema, "agentsam.distribution-roadmap.v1");
  assert.equal(plan.releaseGate.candidate, "2.6.13");
  assert.equal(plan.github.createPolicy.includes("manual approval"), true);
  const phases = new Set(plan.phases.map((phase) => phase.id));
  const ids = new Set(plan.tasks.map((task) => task.id));
  assert.equal(ids.size, plan.tasks.length);
  const byId = new Map(plan.tasks.map((task) => [task.id, task]));
  for (const task of plan.tasks) {
    assert.ok(phases.has(task.phase), task.id);
    assert.equal(task.labels.filter((l) => l.startsWith("type:")).length, 1);
    assert.equal(task.labels.filter((l) => l.startsWith("priority:")).length, 1);
    assert.equal(task.labels.filter((l) => l.startsWith("scope:")).length, 1);
    assert.ok(task.labels.every((l) => labelNames.has(l)), task.id);
    for (const dependency of task.dependsOn) assert.ok(ids.has(dependency), dependency);
  }
  function visit(id, visiting = new Set(), visited = new Set()) {
    if (visited.has(id)) return;
    assert.ok(!visiting.has(id), "cycle at " + id);
    visiting.add(id);
    for (const dep of byId.get(id).dependsOn) visit(dep, visiting, visited);
    visiting.delete(id);
    visited.add(id);
  }
  const visited = new Set();
  for (const id of ids) visit(id, new Set(), visited);
});

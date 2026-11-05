import test from "node:test";
import assert from "node:assert/strict";
import type { Project } from "@inneranimalmedia/agentsam-local-shared";
import {
  isAuthorizedHostProject,
  isSampleProject,
  pickRestoredProjectId,
  projectNeedsConnection,
  LEGACY_STARTER_PROJECT_ID,
} from "./workspace-restore.ts";

function project(partial: Partial<Project> & Pick<Project, "id" | "name">): Project {
  return {
    description: "",
    createdAt: 1,
    updatedAt: 1,
    files: [],
    dirs: [],
    git: { initialized: false, branch: "main", remotes: [], commits: [], staged: [], snapshots: {} },
    deploy: {
      githubOwner: "",
      githubRepo: "",
      githubBranch: "main",
      cloudflareAccountId: "",
      cloudflareProject: "",
    },
    cwd: "/",
    kind: "scratch",
    workspaceRoot: null,
    runtimeBaseUrl: null,
    workspaceId: null,
    runtimeCapability: null,
    ...partial,
  };
}

test("legacy starter and seeded scratch are samples, never authorized hosts", () => {
  const starter = project({
    id: LEGACY_STARTER_PROJECT_ID,
    name: "Studio",
    description: "InnerAnimalMedia workspace · Scratch",
    files: [{ id: "1", path: "README.md", language: "markdown", content: "#", updatedAt: 1, kind: "code", origin: "seed" }],
  });
  assert.equal(isSampleProject(starter), true);
  assert.equal(isAuthorizedHostProject(starter), false);
  assert.equal(projectNeedsConnection(starter), false);
});

test("filesystem with authorized root is the real workspace", () => {
  const host = project({
    id: "fs-1",
    name: "agentsam-sdk",
    kind: "filesystem",
    workspaceRoot: "/tmp/agentsam-sdk-fixture",
    runtimeBaseUrl: "http://127.0.0.1:3099",
    runtimeCapability: "cap",
  });
  assert.equal(isSampleProject(host), false);
  assert.equal(isAuthorizedHostProject(host), true);
  assert.equal(projectNeedsConnection(host), false);
});

test("restore prefers last active id, then authorized host over sample", () => {
  const sample = project({ id: LEGACY_STARTER_PROJECT_ID, name: "Studio", description: "Scratch" });
  const host = project({
    id: "fs-1",
    name: "sdk",
    kind: "filesystem",
    workspaceRoot: "/tmp/sdk",
    runtimeBaseUrl: "http://127.0.0.1:3099",
  });
  assert.equal(pickRestoredProjectId([sample, host], "fs-1"), "fs-1");
  assert.equal(pickRestoredProjectId([sample, host], "missing"), "fs-1");
  assert.equal(pickRestoredProjectId([sample], LEGACY_STARTER_PROJECT_ID), LEGACY_STARTER_PROJECT_ID);
  assert.equal(pickRestoredProjectId([], null), "");
});

test("empty workspace requires an explicit connect or sample action", () => {
  assert.equal(projectNeedsConnection(null), true);
  assert.equal(projectNeedsConnection(project({ id: "empty", name: "Untitled", files: [] })), true);
});

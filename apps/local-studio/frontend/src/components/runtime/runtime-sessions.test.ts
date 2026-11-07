import test from "node:test";
import assert from "node:assert/strict";
import { isConnectedRuntimeSession } from "./runtime-sessions.ts";

const session = {
  state: "connected" as const,
  lane: "local" as const,
  connectionId: "runtime-auto",
  runtimeLabel: "Local CLI",
  instanceId: undefined,
};

test("local native runtime is recognized without inventing a remote provider", () => {
  assert.equal(isConnectedRuntimeSession("local", session), true);
  assert.equal(isConnectedRuntimeSession("gcp", session), false);
  assert.equal(isConnectedRuntimeSession("cf-container", session), false);
});

test("a Docker-capable local CLI is never misreported as a connected container", () => {
  assert.equal(isConnectedRuntimeSession("docker", { ...session, runtimeLabel: "Local CLI · Docker" }), false);
  assert.equal(isConnectedRuntimeSession("docker", { ...session, connectionId: "docker:container_1", runtimeLabel: "Docker container" }), true);
});

test("cloud lanes require provider-specific evidence and a connected state", () => {
  assert.equal(isConnectedRuntimeSession("gcp", { ...session, lane: "remote", connectionId: "gcp:vm1" }), true);
  assert.equal(isConnectedRuntimeSession("cf-sandbox", { ...session, lane: "sandbox", runtimeLabel: "Cloudflare Sandbox" }), true);
  assert.equal(isConnectedRuntimeSession("cf-container", { ...session, lane: "sandbox", runtimeLabel: "Cloudflare Container" }), true);
  assert.equal(isConnectedRuntimeSession("cf-container", { ...session, lane: "sandbox", state: "degraded", runtimeLabel: "Cloudflare Container" }), false);
});

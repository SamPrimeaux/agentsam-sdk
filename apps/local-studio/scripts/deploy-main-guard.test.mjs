import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { parseRemoteMainRef, assertCurrentMainDeployment } from "./deploy-main-guard.mjs";

const current = "79ab5817889b1f211b78d5febfabf2cdf8eda1ab";
const stale = "f9855c11710fd9bf04e428c275272d75b93d37c0";

test("production deployment permits exactly current remote main", () => {
  assert.equal(assertCurrentMainDeployment(current, current), current);
  assert.equal(parseRemoteMainRef(current + "\trefs/heads/main\n"), current);
});

test("stale branch or detached release cannot overwrite newer main", () => {
  assert.throws(() => assertCurrentMainDeployment(stale, current), /deploy_ref_not_current_main/);
});

test("missing or malformed remote ref fails closed", () => {
  assert.throws(() => parseRemoteMainRef(""), /deploy_main_ref_unavailable/);
  assert.throws(() => parseRemoteMainRef(stale + "\trefs/heads/dev"), /deploy_main_ref_unavailable/);
  assert.throws(() => assertCurrentMainDeployment(current, ""), /deploy_source_unverified/);
});

test("deployer verifies remote before invoking wrangler", () => {
  const script = readFileSync(new URL("./deploy-cloudflare.mjs", import.meta.url), "utf8");
  const remote = script.indexOf("ls-remote");
  const gate = script.indexOf("assertCurrentMainDeployment(gitSha, remoteMainSha)");
  const publish = script.indexOf('"wrangler"');
  assert.ok(remote >= 0 && remote < gate && gate < publish);
});

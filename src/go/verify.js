import { readLatestStatus } from './receipts.js';
import { probeGoDeployment } from './cloudflare.js';
import { runGoTests, runGoVet } from './build.js';

export async function verifyGoProduct({
  productRoot,
  stateRoot = productRoot,
  runtimeRoot,
  url = null,
  fetchImpl = globalThis.fetch,
  skipLive = false,
} = {}) {
  const status = readLatestStatus(stateRoot);
  const tests = runtimeRoot ? runGoTests(runtimeRoot) : { ok: false, error: 'no_runtime' };
  const vet = runtimeRoot ? runGoVet(runtimeRoot) : { ok: false, error: 'no_runtime' };
  const liveUrl = url || status.deployment?.url || null;
  let live = { skipped: true, ok: false };
  if (!skipLive && liveUrl) {
    live = await probeGoDeployment(liveUrl, {
      fetchImpl,
      expectedSource: status.deployment?.source_identity || status.build?.source?.identity || null,
      expectedSourceCommit: status.deployment?.source_commit || status.build?.source?.commit || null,
      expectedTarget: 'cloudflare',
      edge: true,
    });
  }

  const ok = Boolean(tests.ok && vet.ok && (skipLive || !liveUrl || live.ok));
  return {
    schema: 'agentsam.go-verify.v1',
    ok,
    tests: { go_test: tests.ok, go_vet: vet.ok },
    deployment: status.deployment,
    build: status.build,
    product: status.product,
    live,
  };
}

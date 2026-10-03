import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  BLOB_R2_PREFIX,
  CompositeReceiptSink,
  LocalReceiptSink,
  R2ReceiptSink,
  RECEIPT_R2_PREFIX,
  RECEIPT_SCHEMA_URL,
  SCHEMAS_BUCKET_NAME,
  pruneLocalWorkspaces,
  receiptR2Key,
  retentionExpiresAt,
  validateReceiptEnvelope,
} from "../../src/receipts/index.js";

function receipt(overrides = {}) {
  return {
    schema: "agentsam.receipt.v1",
    receipt_id: "rcpt_test_001",
    kind: "fs_e2e",
    status: "passed",
    retention_class: "ephemeral_success",
    identity: {
      account_id: "acc_test",
      repository_id: "repo_test",
      git_sha: "abc123",
      run_id: "run_test",
      pty_session_id: "pty_test",
    },
    metrics: {
      created_at_unix: 1790963600,
      duration_ms: 42,
      workspace_byte_size: 1024,
      receipt_byte_size: 256,
    },
    evidence: {
      summary: { verified: true },
      artifacts: [
        {
          role: "failure_diff",
          sha256: "5b47271a9a83c21a41e9124458f3b20a911e38a201b1aef",
          r2_key: `${BLOB_R2_PREFIX}/5b/5b47271a9a83c21a.tar.zst`,
          byte_size: 18204,
        },
      ],
    },
    payload: { schema: "agentsam.fs-e2e-receipt.v1", details: {} },
    ...overrides,
  };
}

test("receipt authority uses only production schema and R2 prefixes", () => {
  assert.equal(RECEIPT_SCHEMA_URL, "https://schemas.inneranimalmedia.com/agentsam/schemas/agentsam.receipt.v1.json");
  assert.equal(SCHEMAS_BUCKET_NAME, "inneranimalmedia-schemas");
  assert.equal(RECEIPT_R2_PREFIX, "agentsam/runtime/receipts/v1");
  assert.equal(receiptR2Key(receipt()), "agentsam/runtime/receipts/v1/2026/10/02/rcpt_test_001.json");
});

test("receipt validation rejects artifact keys outside the canonical blob tree", () => {
  const invalid = receipt({
    evidence: {
      summary: {},
      artifacts: [{ role: "diff", sha256: "a".repeat(64), r2_key: "blobs/sha256/aa/x.tar.zst", byte_size: 1 }],
    },
  });
  const result = validateReceiptEnvelope(invalid);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((message) => message.includes("agentsam/runtime/blobs/sha256")));
});

test("R2 receipt sink writes immutable canonical envelope", async () => {
  const puts = [];
  const sink = new R2ReceiptSink({
    SCHEMAS_BUCKET: {
      async put(key, value, options) { puts.push({ key, value, options }); },
    },
  });
  const result = await sink.write(receipt());
  assert.equal(result.persisted, true);
  assert.equal(result.bucket, "inneranimalmedia-schemas");
  assert.ok(result.r2_key.startsWith("agentsam/runtime/receipts/v1/"));
  assert.equal(result.url, `https://schemas.inneranimalmedia.com/${result.r2_key}`);
  assert.equal(puts.length, 1);
  const body = JSON.parse(puts[0].value);
  assert.equal(body.$schema, RECEIPT_SCHEMA_URL);
  assert.equal(puts[0].options.httpMetadata.contentType, "application/json");
});

test("retention is 7d success, 60d failure bundle, indefinite release proof", () => {
  const now = 1_000_000;
  assert.equal(retentionExpiresAt(receipt(), now), now + 7 * 86400);
  assert.equal(retentionExpiresAt(receipt({ retention_class: "failure_bundle" }), now), now + 60 * 86400);
  assert.equal(retentionExpiresAt(receipt({ retention_class: "release_proof" }), now), null);
});

test("composite sink writes locally and cleans only successful AgentSam workdirs", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "receipt-test-"));
  const local = new LocalReceiptSink({ baseDir: path.join(root, "receipts") });
  const workdir = path.join(root, "agentsam-e2e-test");
  await mkdir(workdir, { recursive: true });
  await writeFile(path.join(workdir, "proof.txt"), "proof");
  const sink = new CompositeReceiptSink({ localSink: local });
  const result = await sink.write(receipt(), { localWorkdir: workdir });
  assert.ok(result.local_path);
  const persisted = JSON.parse(await readFile(result.local_path, "utf8"));
  assert.equal(persisted.$schema, RECEIPT_SCHEMA_URL);
  await assert.rejects(stat(workdir));
});

test("tmp pruning measures bytes and only removes oldest workdirs until under cap", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agentsam-prune-test-"));
  for (const [name, bytes] of [["agentsam-old", 1600], ["agentsam-new", 1600], ["unrelated", 4000]]) {
    const dir = path.join(root, name);
    await mkdir(dir);
    await writeFile(path.join(dir, "blob"), Buffer.alloc(bytes));
    if (name === "agentsam-old") {
      const old = new Date(Date.now() - 100_000);
      const { utimes } = await import("node:fs/promises");
      await utimes(dir, old, old);
    }
  }
  const result = await pruneLocalWorkspaces({ maxTmpGb: 0.000002, tmpDir: root });
  assert.equal(result.purgedCount, 1);
  assert.ok(result.remainingBytes <= result.maxBytes);
  await assert.rejects(stat(path.join(root, "agentsam-old")));
  assert.ok((await stat(path.join(root, "agentsam-new"))).isDirectory());
  assert.ok((await stat(path.join(root, "unrelated"))).isDirectory());
});

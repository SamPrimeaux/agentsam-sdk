import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createClip, createCoProProject, createTrack, serializeCoProProject } from "@inneranimalmedia/copro-project";
import { importEvidencePackage } from "../src/evidence-import.ts";

const sha = (text) => createHash("sha256").update(text).digest("hex");
const BASE = "http://127.0.0.1:4010/";

function pack({ status = "verified", tamper = false, key = "04-Build/2026-01-01/00-Flow/00-00-00-Home.png" } = {}) {
  const png = Buffer.from("png-bytes");
  const assetId = `ev-${sha(png).slice(0, 16)}`;
  const project = createCoProProject({ id: "evidence:acme--20260101--abcdef0", title: "acme" });
  const track = createTrack({ id: "track:journey", kind: "video", name: "Journey" });
  track.clips.push(createClip({ id: "clip:001", assetId, startUs: 0, durationUs: 3_000_000 }));
  project.tracks.push(track);
  const projectJson = serializeCoProProject(project);
  const assetsJson = JSON.stringify({ schema: "agentsam.evidence.assets.v1", runId: "acme--20260101--abcdef0", assets: {
    [assetId]: { key, name: "00-00-00-Home.png", kind: "image", contentType: "image/png", bytes: png.length, sha256: tamper ? "0".repeat(64) : sha(png) } } });
  const manifest = { schema: "agentsam.evidence.v1", runId: "acme--20260101--abcdef0", status, handoff: [
    { key: "06-Handoff/project.copro.json", sha256: sha(projectJson) }, { key: "06-Handoff/assets.json", sha256: sha(assetsJson) }] };
  const files = new Map([["evidence.manifest.json", JSON.stringify(manifest)], ["06-Handoff/project.copro.json", projectJson], ["06-Handoff/assets.json", assetsJson], [key, png]]);
  const fetchImpl = async (href) => {
    const file = files.get(href.slice(BASE.length));
    if (file === undefined) return { ok: false, status: 404 };
    const b = Buffer.from(file);
    return { ok: true, status: 200, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
  };
  return { assetId, fetchImpl };
}
const stores = () => { const saved = []; const puts = []; return { saved, puts, projectStore: { save: async (p) => saved.push(p) }, mediaStore: { put: async (m) => puts.push(m) } }; };

test("imports a delivered package: media into the media store, project into the project store", async () => {
  const { assetId, fetchImpl } = pack();
  const s = stores();
  const result = await importEvidencePackage({ manifestUrl: `${BASE}evidence.manifest.json`, fetchImpl, ...s });
  assert.equal(result.projectId, "evidence:acme--20260101--abcdef0");
  assert.equal(result.status, "verified");
  assert.equal(s.saved.length, 1);
  assert.equal(s.puts[0].id, assetId);
  assert.equal(s.puts[0].kind, "image");
  assert.equal(s.puts[0].durationUs, 3_000_000);
  assert.equal(await s.puts[0].file.text(), "png-bytes");
  assert.equal(s.saved[0].tracks[0].clips[0].assetId, assetId);
});

test("only loopback http links open; hosted URLs and other schemes are refused", async () => {
  const { fetchImpl } = pack();
  for (const url of ["https://example.test/evidence.manifest.json", "http://evil.example/evidence.manifest.json", "file:///etc/passwd", "nope"]) {
    await assert.rejects(importEvidencePackage({ manifestUrl: url, fetchImpl, ...stores() }), /evidence_url_/);
  }
});

test("integrity and path safety: a tampered asset, an escaping key and a failed run never import", async () => {
  const s1 = stores();
  await assert.rejects(importEvidencePackage({ manifestUrl: `${BASE}evidence.manifest.json`, fetchImpl: pack({ tamper: true }).fetchImpl, ...s1 }), /evidence_integrity_mismatch/);
  assert.equal(s1.saved.length, 0, "nothing is saved when verification fails");
  await assert.rejects(importEvidencePackage({ manifestUrl: `${BASE}evidence.manifest.json`, fetchImpl: pack({ key: "../secret.png" }).fetchImpl, ...stores() }), /evidence_key_invalid/);
  await assert.rejects(importEvidencePackage({ manifestUrl: `${BASE}evidence.manifest.json`, fetchImpl: pack({ status: "failed" }).fetchImpl, ...stores() }), /evidence_run_failed/);
  await assert.rejects(importEvidencePackage({ manifestUrl: `${BASE}evidence.manifest.json`, fetchImpl: async () => ({ ok: false, status: 404 }), ...stores() }), /evidence_fetch_failed:404/);
});

test("re-importing the same package is idempotent: same project id, same media ids", async () => {
  const { fetchImpl } = pack();
  const a = stores(); const b = stores();
  const first = await importEvidencePackage({ manifestUrl: `${BASE}evidence.manifest.json`, fetchImpl, ...a });
  const second = await importEvidencePackage({ manifestUrl: `${BASE}evidence.manifest.json`, fetchImpl, ...b });
  assert.equal(first.projectId, second.projectId);
  assert.equal(a.puts[0].id, b.puts[0].id);
});

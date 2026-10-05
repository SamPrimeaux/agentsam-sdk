import test from "node:test";
import assert from "node:assert/strict";
import { createMediaAsset, addMediaSource, MemoryMediaRepository } from "../src/index.js";

test("media asset identity is separate from provider resource identity", () => {
  let asset = createMediaAsset({ id: "asset:hero", kind: "video", name: "Hero take" });
  asset = addMediaSource(asset, {
    provider: "stream",
    locator: { uid: "provider-video-123" },
  });
  asset = addMediaSource(asset, {
    provider: "local",
    locator: { path: "/media/hero.mov" },
  });

  assert.equal(asset.id, "asset:hero");
  assert.equal(asset.sources.length, 2);
  assert.equal(asset.sources[0].locator.uid, "provider-video-123");
});

test("memory repository round-trips assets without exposing mutable references", () => {
  const repo = new MemoryMediaRepository();
  const asset = createMediaAsset({ id: "asset:1", kind: "image", name: "Still" });
  repo.put(asset);
  const copy = repo.get("asset:1");
  copy.name = "Changed";
  assert.equal(repo.get("asset:1").name, "Still");
});


test("waveform envelope is normalized and deterministic", async () => {
  const { computeWaveformEnvelope } = await import("../src/index.js");
  const source = Float32Array.from([0, .25, -.5, 1, -.75, .25, 0, .5]);
  const samples = computeWaveformEnvelope(source, 8);
  assert.equal(samples.length, 8);
  assert.equal(Math.max(...samples), 1);
  assert.deepEqual(samples, [0, .25, .5, 1, .75, .25, 0, .5]);
});

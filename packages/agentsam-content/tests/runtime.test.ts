import { describe, expect, it } from "vitest";
import { createContentRuntime } from "../src/runtime/runtime.js";
import { localFiles } from "../src/providers/local.js";
import type { ContentEvent } from "../src/core/events.js";

function pngBytes(width: number, height: number): Uint8Array {
  const b = new Uint8Array(64);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  b.set([0, 0, 0, 13], 8);
  b.set([0x49, 0x48, 0x44, 0x52], 12);
  new DataView(b.buffer).setUint32(16, width);
  new DataView(b.buffer).setUint32(20, height);
  b[24] = 8;
  b[25] = 6;
  return b;
}

function makeRuntime() {
  return createContentRuntime({
    identity: { type: "human", ref: "tester" },
    account: { id: "acct_test" },
    providers: [localFiles()],
  });
}

describe("createContentRuntime", () => {
  it("importAsset stores the actual bytes and links a deliverable provider reference", async () => {
    const provider = localFiles();
    const runtime = createContentRuntime({
      identity: { type: "human", ref: "tester" },
      account: { id: "acct_test" },
      providers: [provider],
    });
    const bytes = pngBytes(24, 24);
    const asset = await runtime.importAsset({ bytes, filename: "test.png", mime: "image/png", optimize: false });
    expect(asset.providerRefs).toHaveLength(1);
    expect(asset.providerRefs[0]?.provider).toBe("local");
    expect(await provider.read(asset.providerRefs[0]!.ref)).toEqual(bytes);
    expect(runtime.deliveryUrl(asset)).toMatch(/^data:image\/png;base64,/);
  });
  it("creates an asset with machine facts from raw bytes", async () => {
    const rt = makeRuntime();
    const asset = await rt.createAsset({
      origin: "upload",
      source: { type: "upload" },
      filename: "IMG_5933.PNG",
      rawBytes: pngBytes(800, 600),
    });
    expect(asset.id).toMatch(/^ast_/);
    expect(asset.kind).toBe("image");
    expect(asset.width).toBe(800);
    expect(asset.height).toBe(600);
    expect(asset.mime).toBe("image/png");
    expect(asset.intelligence?.machine?.hash).toHaveLength(64);
  });

  it("detects duplicates across uploads", async () => {
    const rt = makeRuntime();
    const bytes = pngBytes(320, 240);
    const first = await rt.createAsset({ origin: "upload", source: { type: "upload" }, filename: "a.png", rawBytes: bytes });
    const second = await rt.createAsset({ origin: "upload", source: { type: "upload" }, filename: "b.png", rawBytes: bytes });
    expect(second.intelligence?.machine?.duplicateOf).toBe(first.id);
  });

  it("walks the generated draft → review → approved → live lifecycle with events", async () => {
    const rt = makeRuntime();
    const events: ContentEvent[] = [];
    rt.events.on("*", (e) => events.push(e));

    const asset = await rt.createAsset({
      origin: "generated",
      source: { type: "generation", ref: "job_1" },
      kind: "image",
      generation: { model: "test-model", prompt: "garage/car motif logo", promptHash: "abc123" },
    });
    expect(asset.state).toBe("draft");

    await rt.transition(asset.id, "review");
    await rt.transition(asset.id, "approved");
    const live = await rt.transition(asset.id, "live");
    expect(live.state).toBe("live");

    const types = events.map((e) => e.type);
    expect(types).toContain("content.asset.generated");
    expect(types).toContain("content.asset.state-changed");
    expect(types).toContain("content.asset.published");
    expect(live.provenance.generation?.model).toBe("test-model");
  });

  it("rejects illegal transitions", async () => {
    const rt = makeRuntime();
    const asset = await rt.createAsset({ origin: "generated", source: { type: "generation" }, kind: "image" });
    await expect(rt.transition(asset.id, "live")).rejects.toThrow(/Illegal/);
  });

  it("refuses to delete assets with live usage, allows after detach", async () => {
    const rt = makeRuntime();
    const asset = await rt.createAsset({ origin: "upload", source: { type: "upload" }, kind: "image", filename: "hero.png" });
    await rt.attachUsage(asset.id, { app: "ember", surface: "home.hero", live: true });

    await expect(rt.deleteAsset(asset.id)).rejects.toThrow(/Used in 1 live surface/);

    await rt.detachUsage(asset.id, "ember", "home.hero");
    await rt.deleteAsset(asset.id);
    expect(await rt.getAsset(asset.id)).toBeNull();
  });

  it("computes views over metadata instead of physical folders", async () => {
    const rt = makeRuntime();
    await rt.createAsset({ origin: "generated", source: { type: "generation" }, kind: "image" });
    await rt.createAsset({
      origin: "cms-import",
      source: { type: "site-crawl", ref: "https://old-customer-site.com", batch: "import_0137" },
      kind: "image",
      filename: "legacy-banner.jpg",
    });

    const generated = await rt.listView("generated");
    const imported = await rt.listView("imported");
    const review = await rt.listView("needs-review");
    expect(generated.total).toBe(1);
    expect(imported.total).toBe(1);
    expect(imported.assets[0]?.provenance.import?.batch).toBe("import_0137");
    expect(review.total).toBe(1); // cms-import lands in review
  });

  it("edits create revisions and tagged events, rating is preserved", async () => {
    const rt = makeRuntime();
    const asset = await rt.createAsset({ origin: "upload", source: { type: "upload" }, kind: "image", filename: "x.png" });
    await rt.editAsset(asset.id, { tags: ["logo", "hourglass"], alt: "Black hourglass mark" });
    const rated = await rt.rate(asset.id, -1);
    expect(rated.rating).toBe(-1);

    const revs = await rt.store.revisions(asset.id);
    expect(revs).toHaveLength(1);
    expect(Object.keys(revs[0]!.changes)).toEqual(expect.arrayContaining(["tags", "alt"]));
    expect(rt.events.history({ assetId: asset.id, type: "content.asset.tagged" })).toHaveLength(1);
    expect(rt.events.history({ assetId: asset.id, type: "content.asset.rated" })).toHaveLength(1);
  });

  it("applies non-destructive semantic aliases", async () => {
    const rt = makeRuntime();
    const asset = await rt.createAsset({
      origin: "upload",
      source: { type: "upload" },
      kind: "image",
      filename: "IMG_5933.PNG",
      title: "AgentSam workbench review mobile screenshot",
      brandId: "ember",
    });
    const named = await rt.applySemanticAlias(asset.id);
    expect(named.filename).toBe("IMG_5933.PNG"); // original preserved
    expect(named.semanticAlias).toContain("ember");
    expect(named.semanticAlias).toMatch(/^[a-z0-9-]+$/);
  });

  it("builds an assistant context with machine facts first", async () => {
    const rt = makeRuntime();
    const asset = await rt.createAsset({
      origin: "upload",
      source: { type: "upload" },
      filename: "big.png",
      rawBytes: pngBytes(2000, 1000),
    });
    await rt.attachUsage(asset.id, { app: "ember", surface: "home.hero", live: true });

    const ctx = await rt.assistantContext(asset.id, { currentInspector: "delivery" });
    expect(ctx.accountId).toBe("acct_test");
    expect(ctx.asset.intelligence?.machine?.hash).toBeDefined();
    expect(ctx.deleteSafety.safe).toBe(false);
    expect(ctx.providerNames).toContain("local");
    expect(ctx.currentInspector).toBe("delivery");
    expect(ctx.seo.score).toBeGreaterThanOrEqual(0);
  });

  it("enforces permissions", async () => {
    const rt = createContentRuntime({
      identity: { type: "human", ref: "viewer" },
      account: { id: "acct_test" },
      providers: [localFiles()],
      permissions: { can: (_a, p) => p === "content.read" },
    });
    await expect(
      rt.createAsset({ origin: "upload", source: { type: "upload" }, kind: "image" }),
    ).rejects.toThrow(/Permission denied/);
  });
});

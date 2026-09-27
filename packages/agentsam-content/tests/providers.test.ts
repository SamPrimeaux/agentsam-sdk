import { describe, expect, it } from "vitest";
import { cloudflareImages } from "../src/providers/cloudflare-images.js";
import { cloudflareStream } from "../src/providers/cloudflare-stream.js";
import { localFiles } from "../src/providers/local.js";
import { cms } from "../src/providers/cms.js";
import { createProviderRegistry } from "../src/providers/registry.js";

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

describe("providers", () => {
  it("local provider round-trips upload/list/head/delete + delivery", async () => {
    const p = localFiles();
    const ref = await p.upload({ name: "test.png", mime: "image/png", bytes: new Uint8Array([1, 2, 3]) });
    expect(ref.provider).toBe("local");

    const listed = await p.list();
    expect(listed.objects).toHaveLength(1);

    const head = await p.head(ref.ref);
    expect(head?.name).toBe("test.png");

    expect(p.deliveryUrl(ref.ref)).toMatch(/^data:image\/png;base64,/);

    await p.delete(ref.ref);
    expect(await p.head(ref.ref)).toBeNull();
  });

  it("cloudflare-images builds flexible + variant delivery URLs and calls the API", async () => {
    const calls: string[] = [];
    const p = cloudflareImages({
      accountId: "acc",
      apiToken: "tok",
      deliveryHash: "HASH",
      fetch: async (url) => {
        calls.push(url);
        return jsonResponse({ result: { images: [{ id: "img1", filename: "a.png" }] } });
      },
    });

    const listed = await p.list();
    expect(listed.objects[0]?.ref).toBe("img1");
    expect(calls[0]).toContain("/accounts/acc/images/v1");

    expect(p.deliveryUrl("img1", { width: 1280, format: "avif" })).toBe(
      "https://imagedelivery.net/HASH/img1/w=1280,f=avif",
    );
    expect(p.deliveryUrl("img1", { variant: "hero" })).toBe(
      "https://imagedelivery.net/HASH/img1/hero",
    );
  });

  it("cloudflare-stream maps records and builds HLS/poster URLs", async () => {
    const p = cloudflareStream({
      accountId: "acc",
      apiToken: "tok",
      customerCode: "abc123",
      fetch: async () =>
        jsonResponse({
          result: {
            uid: "vid1",
            duration: 12.5,
            status: { state: "ready" },
            input: { width: 1920, height: 1080 },
          },
        }),
    });

    const head = await p.head("vid1");
    expect(head?.durationMs).toBe(12500);
    expect(head?.width).toBe(1920);

    expect(p.deliveryUrl("vid1", { format: "hls" })).toBe(
      "https://customer-abc123.cloudflarestream.com/vid1/manifest/video.m3u8",
    );
    expect(p.deliveryUrl("vid1", { format: "poster", width: 640 })).toContain(
      "/thumbnails/thumbnail.jpg?width=640",
    );
  });

  it("cms provider is a read-only ingest facade", async () => {
    const p = cms({
      sourceRef: "site-crawl:https://old-customer-site.com",
      discover: async () => ({
        assets: [{ ref: "https://old-customer-site.com/banner.jpg", name: "banner.jpg", mime: "image/jpeg" }],
      }),
    });
    const listed = await p.list();
    expect(listed.objects).toHaveLength(1);
    await expect(p.upload({ name: "x" })).rejects.toThrow(/read-only/);
    await expect(p.delete("x")).rejects.toThrow(/read-only/);
  });

  it("registry filters by capability", () => {
    const registry = createProviderRegistry([
      localFiles(),
      cms({ sourceRef: "x", discover: async () => ({ assets: [] }) }),
    ]);
    expect(registry.names()).toEqual(["local", "cms"]);
    expect(registry.withCapability("upload").map((p) => p.name)).toEqual(["local"]);
    expect(registry.withCapability("sync").map((p) => p.name)).toEqual(["cms"]);
  });
});

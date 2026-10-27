import { describe, expect, it } from "vitest";
import {
  CloudflareImagesTransport,
  cloudflareImageUrl,
  cloudflareImagesDeliveryBase,
  resolveCloudflareImagesCredentials,
} from "../src/index.js";

describe("agentsam-cloudflare-images", () => {
  it("resolves credentials without inventing tokens", () => {
    const empty = resolveCloudflareImagesCredentials({});
    expect(empty.tokenConfigured).toBe(false);
    const creds = resolveCloudflareImagesCredentials({
      CLOUDFLARE_ACCOUNT_ID: "acct",
      CLOUDFLARE_IMAGES_ACCOUNT_HASH: "hash",
      CLOUDFLARE_IMAGES_API_TOKEN: "secret",
    });
    expect(creds.accountId).toBe("acct");
    expect(creds.tokenEnv).toBe("CLOUDFLARE_IMAGES_API_TOKEN");
    expect(creds.tokenConfigured).toBe(true);
  });

  it("builds delivery URLs from hash + id only", () => {
    expect(cloudflareImagesDeliveryBase("abc")).toBe("https://imagedelivery.net/abc");
    expect(cloudflareImageUrl({ accountHash: "abc", imageId: "img1" })).toBe(
      "https://imagedelivery.net/abc/img1/public",
    );
    expect(cloudflareImageUrl({ accountHash: "", imageId: "img1" })).toBeNull();
  });

  it("lists via shared transport", async () => {
    const calls: string[] = [];
    const transport = new CloudflareImagesTransport({
      accountId: "acct",
      apiToken: "tok",
      deliveryHash: "hash",
      fetch: async (url) => {
        calls.push(url);
        return new Response(
          JSON.stringify({ result: { images: [{ id: "i1", filename: "a.png" }] } }),
          { status: 200 },
        );
      },
    });
    const listed = await transport.list();
    expect(listed.images[0]?.id).toBe("i1");
    expect(transport.deliveryUrl("i1", { width: 640 })).toContain("imagedelivery.net/hash/i1/");
    expect(calls[0]).toContain("/images/v2?");
  });

  it("pages with the provider continuation token, not a guessed page number", async () => {
    const calls: string[] = [];
    const transport = new CloudflareImagesTransport({
      accountId: "acct",
      apiToken: "tok",
      deliveryHash: "hash",
      fetch: async (url) => {
        calls.push(url);
        return new Response(JSON.stringify({
          success: true,
          result: {
            images: [{ id: calls.length === 1 ? "i1" : "i2" }],
            ...(calls.length === 1 ? { continuation_token: "opaque+next/page" } : {}),
          },
        }), { status: 200 });
      },
    });
    const first = await transport.list({ limit: 50 });
    expect(first.images.map((i) => i.id)).toEqual(["i1"]);
    expect(first.nextCursor).toBe("opaque+next/page");
    const second = await transport.list({ cursor: first.nextCursor, limit: 50 });
    expect(second.images.map((i) => i.id)).toEqual(["i2"]);
    expect(second.nextCursor).toBeUndefined();
    expect(new URL(calls[0]).searchParams.has("continuation_token")).toBe(false);
    expect(new URL(calls[1]).searchParams.get("continuation_token")).toBe("opaque+next/page");
    expect(new URL(calls[1]).searchParams.get("per_page")).toBe("50");
  });

  it("does not treat a failed Cloudflare response as an empty gallery", async () => {
    const transport = new CloudflareImagesTransport({
      accountId: "acct",
      apiToken: "tok",
      deliveryHash: "hash",
      fetch: async () => new Response(JSON.stringify({ success: false, errors: [] }), { status: 200 }),
    });
    await expect(transport.list()).rejects.toThrow("invalid response");
  });
});

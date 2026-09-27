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
    expect(calls[0]).toContain("/images/v1?");
  });
});

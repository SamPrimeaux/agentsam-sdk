import { describe, expect, it } from "vitest";
import {
  createCloudflareR2Admin,
  resolveCloudflareR2AdminToken,
} from "../src/server/r2-admin.js";

describe("Cloudflare R2 admin transport", () => {
  it("resolves credential aliases, primary first", () => {
    expect(resolveCloudflareR2AdminToken({ CLOUDFLARE_API_TOKEN: "a", CF_API_TOKEN: "b" })).toBe("a");
    expect(resolveCloudflareR2AdminToken({ CF_API_TOKEN: "b" })).toBe("b");
  });

  it("lists one folder page with prefixes and an opaque cursor", async () => {
    let requestUrl: URL | null = null;
    const client = createCloudflareR2Admin({
      accountId: "acct_test",
      bucketName: "bucket_test",
      apiToken: "token_test",
      fetch: async (url) => {
        requestUrl = new URL(url);
        return new Response(JSON.stringify({
          success: true,
          result: [{ key: "packages/platform/README.md", size: 123 }],
          result_info: { delimited: ["packages/platform/assistant-workspace/"], cursor: "next", is_truncated: true },
        }), { status: 200, headers: { "content-type": "application/json" } });
      },
    });
    const page = await client.listR2ObjectsPage("packages/platform/", { delimiter: "/", limit: 25, cursor: "prior" });
    expect(requestUrl?.searchParams.get("delimiter")).toBe("/");
    expect(requestUrl?.searchParams.get("cursor")).toBe("prior");
    expect(page.objects).toEqual([{ key: "packages/platform/README.md", size: 123, uploaded: undefined }]);
    expect(page.prefixes).toEqual(["packages/platform/assistant-workspace/"]);
    expect(page.cursor).toBe("next");
    expect(page.truncated).toBe(true);
  });

  it("keeps listR2Objects as a recursive compatibility wrapper over pages", async () => {
    const requested: URL[] = [];
    let pageIndex = 0;
    const client = createCloudflareR2Admin({
      accountId: "acct_test",
      bucketName: "bucket_test",
      apiToken: "token_test",
      fetch: async (url) => {
        requested.push(new URL(url));
        pageIndex += 1;
        return new Response(JSON.stringify({
          success: true,
          result: pageIndex === 1
            ? [{ key: "images/a.webp", size: 123 }]
            : [{ key: "images/b.webp", size: 456 }],
          result_info: pageIndex === 1 ? { cursor: "next", is_truncated: true } : { is_truncated: false },
        }), { status: 200, headers: { "content-type": "application/json" } });
      },
    });
    await expect(client.listR2Objects("images/")).resolves.toEqual([
      { key: "images/a.webp", size: 123, uploaded: undefined },
      { key: "images/b.webp", size: 456, uploaded: undefined },
    ]);
    expect(requested).toHaveLength(2);
    expect(requested[0].searchParams.has("delimiter")).toBe(false);
    expect(requested[1].searchParams.get("cursor")).toBe("next");
  });

  it("dry-runs mutations without spawning Wrangler", () => {
    const client = createCloudflareR2Admin({ accountId: "a", bucketName: "b", env: {} });
    expect(client.putObjectFromFile("/images/a.webp", "/tmp/a.webp", "image/webp", {}, { dryRun: true })).toEqual({
      ok: true,
      dry_run: true,
      key: "images/a.webp",
    });
    expect(client.deleteR2Object("images/a.webp", { dryRun: true })).toEqual({
      ok: true,
      dry_run: true,
      key: "images/a.webp",
    });
  });
});

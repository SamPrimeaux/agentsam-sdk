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

  it("lists objects through an injected fetch", async () => {
    const client = createCloudflareR2Admin({
      accountId: "acct_test",
      bucketName: "bucket_test",
      apiToken: "token_test",
      fetch: async () =>
        new Response(
          JSON.stringify({ success: true, result: [{ key: "images/a.webp", size: 123 }], result_info: {} }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    });
    await expect(client.listR2Objects("images/")).resolves.toEqual([
      { key: "images/a.webp", size: 123, uploaded: undefined },
    ]);
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

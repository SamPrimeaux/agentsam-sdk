import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { requireStorageRole, scoreStorageCandidate } from "../src/storage/roles.js";
import { discoverStorageCandidates } from "../src/server/discover-storage.js";

describe("storage roles", () => {
  it("requires a mapping with an actionable error", () => {
    expect(() => requireStorageRole({}, "website_assets")).toThrow(/agentsam doctor/);
    expect(requireStorageRole({ website_assets: { provider: "r2", binding: "MEDIA" } }, "website_assets").binding).toBe("MEDIA");
  });

  it("scores the convention above arbitrary buckets", () => {
    const a = scoreStorageCandidate({ provider: "r2", binding: "WEBSITE_ASSETS", capabilities: [] });
    const b = scoreStorageCandidate({ provider: "r2", binding: "X", bucket: "random", capabilities: [] });
    expect(a).toBeGreaterThan(b);
  });

  it("discovers non-conventional bindings from jsonc and toml", () => {
    const j = mkdtempSync(join(tmpdir(), "as-j-"));
    writeFileSync(
      join(j, "wrangler.jsonc"),
      `{ // c\n "r2_buckets": [{ "binding": "MEDIA", "bucket_name": "acme-media" }, { "binding": "ARCHIVE", "bucket_name": "acme-archive" },] }`,
    );
    const rj = discoverStorageCandidates({ cwd: j, knownBindings: ["MEDIA"] });
    expect(rj.map((c) => c.binding)).toEqual(["MEDIA", "ARCHIVE"]);

    const t = mkdtempSync(join(tmpdir(), "as-t-"));
    writeFileSync(join(t, "wrangler.toml"), `[[r2_buckets]]\nbinding = "R2"\nbucket_name = "site-assets"\n`);
    expect(discoverStorageCandidates({ cwd: t })[0]).toMatchObject({ binding: "R2", bucket: "site-assets" });
  });
});

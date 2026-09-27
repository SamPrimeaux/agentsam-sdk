import { describe, expect, it } from "vitest";
import {
  createEmptyAssetRecord,
  isAssetId,
  isAssetInput,
  masterRepresentation,
  primaryRepresentation,
  type AssetRecord,
} from "../src/index.js";

describe("agentsam-assets-core", () => {
  it("creates empty AssetRecord and helpers", () => {
    const record: AssetRecord = createEmptyAssetRecord({
      id: "ast_fixture01",
      accountId: "acct_test",
      kind: "image",
      originalName: "logo.svg",
    });
    expect(isAssetId(record.id)).toBe(true);
    expect(record.representations).toEqual([]);
    expect(record.hashes).toEqual({});
    expect(record.provenance.history).toEqual([]);

    record.representations.push(
      { provider: "r2", ref: "brands/x/logo.svg", role: "master" },
      { provider: "cloudflare-images", ref: "img_1", role: "delivery", verified: true },
    );
    expect(masterRepresentation(record.representations)?.provider).toBe("r2");
    expect(primaryRepresentation(record.representations)?.provider).toBe("cloudflare-images");
  });

  it("recognizes AssetInput kinds", () => {
    expect(isAssetInput({ kind: "local-path", path: "/tmp/a.png" })).toBe(true);
    expect(isAssetInput({ kind: "asset-id", assetId: "ast_1" })).toBe(true);
    expect(isAssetInput({ kind: "nope" })).toBe(false);
  });
});

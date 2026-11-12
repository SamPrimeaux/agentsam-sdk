import assert from "node:assert/strict";
import test from "node:test";
import { mediaConnectUrl, toLibraryError, canDeleteMediaAsset, canEditMediaMetadata } from "./media-utils.ts";

test("expired Studio login is not treated as a Cloudflare OAuth grant failure", () => {
  const result = toLibraryError(401, { error: "authentication_required" });
  assert.equal(result.kind, "session");
  assert.match(result.message, /Studio session/);
  assert.equal(toLibraryError(401, {}).kind, "session");
});

test("only explicit Cloudflare OAuth errors request reconnect", () => {
  const result = toLibraryError(401, { error: "cloudflare_reconnect_required",
    connect_url: "/api/connections/cloudflare/start?packs=media" });
  assert.equal(result.kind, "reconnect");
  assert.match(result.connectUrl || "", /^\/api\/connections\/cloudflare\/start/);
  assert.equal(toLibraryError(409, { error: "cloudflare_account_selection_required" }).kind, "account");
  assert.equal(toLibraryError(403, { error: "cloudflare_permission_denied" }).kind, "generic");
  assert.equal(toLibraryError(502, { error: "cloudflare_network_error" }).kind, "generic");
});

test("reconnect callback remains within app and preserves the media destination", () => {
  const result = mediaConnectUrl(
    "https://agentsam.inneranimalmedia.com/api/connections/cloudflare/start?packs=media,data",
    "/media/images",
  );
  assert.equal(new URL(result, "https://agentsam.inneranimalmedia.com").searchParams.get("return_to"), "/media/images");
});


test("asset menu only exposes provider-backed mutations", () => {
  for (const source of ["cf_images", "r2", "stream", "local", "drive"]) {
    const asset = { id: source + "_asset", filename: "test.png", source };
    assert.equal(canEditMediaMetadata(asset), source === "cf_images");
    assert.equal(canDeleteMediaAsset(asset), ["cf_images", "r2", "stream"].includes(source));
  }
  assert.equal(canDeleteMediaAsset({ id: "test", filename: "file.png", source: "local" }), false);
});

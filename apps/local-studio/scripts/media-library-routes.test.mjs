import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolveLegacyContentMediaPath } from "../shared/studio-admin-routes.mjs";

const read = (file) => readFileSync(fileURLToPath(new URL(file, import.meta.url)), "utf8");

test("Media Library owns /media; MovieMode owns /admin/moviemode only", () => {
  assert.match(read("../frontend/src/routes/(apps)/media.tsx"), /MediaLibraryPage/);
  assert.doesNotMatch(read("../frontend/src/routes/(apps)/media.tsx"), /MovieModeSurface/);
  assert.match(read("../frontend/src/routes/(apps)/admin/moviemode.tsx"), /MovieModeSurface/);
  assert.match(read("../frontend/src/routes/(apps)/admin/moviemode.edit.tsx"), /screen="editor"/);
  assert.match(read("../frontend/src/routes/(apps)/media.edit.tsx"), /\/admin\/moviemode\/edit/);
  for (const kind of ["images", "videos", "models", "files"]) {
    assert.match(
      read(`../frontend/src/routes/(apps)/media.${kind}.tsx`),
      new RegExp(`createFileRoute\\("\\/\\(apps\\)\\/media\\/${kind}"\\)`),
    );
  }
});

test("MovieMode surface never navigates back onto /media", () => {
  const surface = read("../frontend/src/components/media/MovieModeSurface.tsx");
  assert.match(surface, /\/admin\/moviemode/);
  assert.doesNotMatch(surface, /\/media\/edit|to: '\/media'/);
});

test("Legacy Content paths fold into Media destinations", () => {
  assert.equal(resolveLegacyContentMediaPath("/admin/content", new URLSearchParams()), "/media");
  assert.equal(resolveLegacyContentMediaPath("/admin/content", new URLSearchParams("kind=image")), "/media/images");
  assert.equal(resolveLegacyContentMediaPath("/admin/content", new URLSearchParams("kind=video")), "/media/videos");
  assert.equal(resolveLegacyContentMediaPath("/admin/products", new URLSearchParams()), null);
});

test("Navigation projection points Media at the library tree", () => {
  const nav = read("../scripts/studio-navigation.mjs");
  assert.match(nav, /id:'media',label:'Library',href:'\/media'/);
  assert.match(nav, /href:'\/media\/images'/);
  assert.match(nav, /href:'\/media\/videos'/);
  assert.match(nav, /agentsam-copro-studio': \{ href: '\/admin\/moviemode'/);
  assert.match(nav, /aliases: \[\]/);
});

test("Studio shells stage Media mounts alongside MovieMode", () => {
  const stage = read("../scripts/stage-settings-shell.mjs");
  assert.match(stage, /'media'/);
  assert.match(stage, /'media\/images'/);
  assert.match(stage, /'moviemode'/);
});

test("Media Library page is a first-party gallery, not a MovieMode wrapper", () => {
  const page = read("../frontend/src/components/media/MediaLibraryPage.tsx");
  assert.match(page, /agentsam-media-library/);
  assert.match(page, /\/api\/connections\/cloudflare\/resources/);
  assert.match(page, /\/api\/admin\/media/);
  assert.doesNotMatch(page, /MovieModeSurface|FIXTURE_PROJECTS/);
});

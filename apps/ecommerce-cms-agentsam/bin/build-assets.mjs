#!/usr/bin/env node
/** Standalone Ecommerce asset assembler. Only app-local and installed package inputs. */
import { cp, mkdir, rm, readFile, writeFile } from "node:fs/promises";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build as bundle } from "esbuild";
import { execFileSync } from "node:child_process";

import { STARTER_PRODUCT_ILLUSTRATIONS } from '../frontend/theme-editor/starter-products.mjs';
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dest = path.join(app, "dist/assets");
const source = (name) => path.join(app, name);
const installed = (name) => path.join(app, "node_modules", name);
const copy = async (from, to) => {
  if (!fs.existsSync(from)) throw new Error("Required installed asset missing: " + from);
  await mkdir(path.dirname(to), { recursive: true });
  await cp(from, to, { recursive: true });
};
execFileSync(process.execPath, [source("scripts/sync-theme-embed-catalog.mjs")], { stdio: "inherit" });
await rm(dest, { recursive: true, force: true });
await mkdir(dest, { recursive: true });
// theme-scenes is the canonical cross-product scene package. Generate the
// app-local ESM mirror from that source when building inside the SDK repo;
// the committed mirror keeps standalone CMS builds independent of the SDK.
const themeScenesSource = path.resolve(app, "../../packages/theme-scenes/src/cms/index.js");
const themeScenesRuntime = source("packages/theme-contract/runtime/theme-scenes-sections.mjs");
if (fs.existsSync(themeScenesSource)) {
  const built = await bundle({
    entryPoints: [themeScenesSource], bundle: true, platform: "neutral",
    format: "esm", target: "es2022", write: false, minify: false,
  });
  await writeFile(themeScenesRuntime, built.outputFiles[0].contents);
}
if (!fs.existsSync(themeScenesRuntime)) {
  throw new Error("Incomplete Ecommerce release: theme-scenes CMS runtime is missing");
}
// The .iamscene viewer is built from its independent package and loaded only
// on pages that actually contain an interactive scene document.
const iamSceneBrowserSource = path.resolve(app, "../../packages/iamscene/src/browser.ts");
const iamSceneBrowserMirror = source("frontend/static/js/iamscene-runtime.js");
let iamSceneBrowserBytes;
if (fs.existsSync(iamSceneBrowserSource)) {
  const built = await bundle({
    entryPoints: [iamSceneBrowserSource], bundle: true, platform: "browser",
    format: "iife", globalName: "IamSceneRuntimeBundle", target: "es2022",
    write: false, minify: true,
  });
  iamSceneBrowserBytes = built.outputFiles[0].contents;
} else if (fs.existsSync(iamSceneBrowserMirror)) {
  // A standalone npm installation has the committed mirror, not the SDK source.
  iamSceneBrowserBytes = await readFile(iamSceneBrowserMirror);
} else {
  throw new Error("Incomplete Ecommerce release: iamscene browser runtime is missing");
}
await copy(source("frontend/static"), path.join(dest, "admin"));
// Customer Identity portals are public storefront routes, not admin pages.
// Publish their generated assets at the root path used by the Identity worker router.
await copy(source("frontend/static/identity-portal"), path.join(dest, "identity-portal"));
// The analytics routes are served by the packaged React SPA and shared analytics
// packages. The original standalone HTML/Babel export is not an app runtime:
// don't ship its 21 vendor assets a second time under the CMS package prefix.
// Canonical /admin/analytics/{overview,finance,health} still mount _spa/index.html.
await rm(path.join(dest, "admin/analytics"), { recursive: true, force: true });
// Generated releases belong in dist, not the tracked frontend/static mirror.
// Both public URLs must contain the exact same source-derived runtime bytes.
for (const asset of ["admin/js/iamscene-runtime.js", "js/iamscene-runtime.js"]) {
  const output = path.join(dest, asset);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, iamSceneBrowserBytes);
}
// The project bootstrap mounts the same editor through this public namespace.
await copy(source("frontend/theme-editor"),path.join(dest,"theme-editor"));
for(const [name,input] of [["runtime.js","js/theme-editor.js"],["shared.js","js/pages-shared.js"],["editor.css","css/theme-editor.css"]])
  await copy(source("frontend/static/"+input),path.join(dest,"theme-editor",name));

// Original reusable vector assets, available outside the theme draft as well.
const sampleAssets=path.join(dest,"admin/illustrations/starter-products");
await mkdir(sampleAssets,{recursive:true});
for(const product of STARTER_PRODUCT_ILLUSTRATIONS)
  await writeFile(path.join(sampleAssets,product.id+".svg"),product.svg);
await writeFile(path.join(sampleAssets,"index.json"),JSON.stringify(STARTER_PRODUCT_ILLUSTRATIONS.map(({svg,image_url,...p})=>({
  ...p,image_url:"./"+p.id+".svg"
})),null,2)+"\n");

// Serve the identical app-owned validation/renderer contract to the editor.
await copy(source("backend/cms/theme-style-contract.mjs"), path.join(dest, "admin/js/theme-style-contract.mjs"));
// Product-owned mobile dock, sidebar profile menu and manifest-backed config.
await copy(source("frontend/dock"), path.join(dest, "admin/dock"));
await copy(source("frontend/profile-popup"), path.join(dest, "admin/profile-popup"));
const manifest = JSON.parse(await readFile(source("agentsam.app.json"), "utf8"));
if (!Array.isArray(manifest.dock?.tabs) || !manifest.dock.tabs.length) {
  throw new Error("Ecommerce manifest has no dock tabs");
}
await writeFile(path.join(dest, "admin/dock/dock.config.json"),
  JSON.stringify(manifest.dock, null, 2) + "\n");
await copy(source("frontend/dist"), path.join(dest, "admin/_spa"));
// The admin SPA shell imports these original app-owned runtime controllers.
// They are not in frontend/static and must be shipped explicitly rather than
// allowing an included-app build to report success with broken URLs.
for (const name of ["shell.js", "inspector.js"]) {
  await copy(source(`frontend/${name}`), path.join(dest, "admin/js", name));
}
// Media Library uses browser ES imports. These must ship with the release,
// not be resolved from FuelNFreetime's surrounding monorepo at runtime.
await copy(source("packages/media-kit/src"), path.join(dest, "admin/media-kit"));
await copy(source("packages/agentsam-workbench/src"), path.join(dest, "admin/workbench"));
// Bundle the canonical TypeScript CMS definition engine for the browser
// instead of requiring an obsolete second JS authoring implementation.
const authoring = await bundle({
  entryPoints: [source("cms/authoring/engine.ts")],
  bundle: true, platform: "browser", format: "iife",
  globalName: "AgentSamCmsAuthoring", target: "es2022",
  write: false, minify: false,
});
await writeFile(path.join(dest, "admin/js/cms-authoring-engine.js"),
  authoring.outputFiles[0].contents);
await copy(source("packages/theme-contract/runtime/theme-preview-registry.js"),
  path.join(dest, "admin/js/theme-preview-registry.js"));
for (const extension of ["js", "css"]) {
  const runtime = source("packages/theme-contract/runtime/portable-sections." + extension);
  await copy(runtime, path.join(dest, "js/portable-sections." + extension));
  await copy(runtime, path.join(dest, "admin/js/portable-sections." + extension));
}
// The same owner-provided, schema-validated stock components run in the
// merchant editor and Cloudflare Worker. Never ship a labels-only picker.
for (const name of ["js/platform-stock-sections.js", "admin/js/platform-stock-sections.js"]) {
  await copy(source("packages/theme-contract/runtime/platform-stock-sections.js"),
    path.join(dest,name));
}
// The same scene package renderer runs in Theme Studio, catalog previews and
// published site sections. Its browser entry is bundled from the generated
// app-local ESM mirror so the standalone CMS app needs no SDK workspace path.
const themeScenesBrowser = await bundle({
  entryPoints: [source("packages/theme-contract/runtime/theme-scenes-browser.mjs")],
  bundle: true, platform: "browser", format: "iife",
  globalName: "ThemeScenesSectionsBundle", target: "es2022",
  write: false, minify: false,
});
for (const name of ["js/theme-scenes-sections.js", "admin/js/theme-scenes-sections.js"]) {
  const out = path.join(dest, name);
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, themeScenesBrowser.outputFiles[0].contents);
}
const themeScenesModule = await import(pathToFileURL(themeScenesRuntime).href);
for (const name of ["css/theme-scenes-sections.css", "admin/css/theme-scenes-sections.css"]) {
  const out = path.join(dest, name);
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, themeScenesModule.THEME_SCENES_CMS_STYLES + "\n");
}
// PrimeTech portable sections use the original shared Three.js world and
// the original I.AM Scene circuit source meshes. Both browser runtimes are
// bundled once and served to the Theme Studio preview and published storefront.
for (const [entry, asset] of [
  ["primetech-scene-browser.js", "primetech-scene.js"],
  ["primetech-circuit-browser.js", "primetech-circuit.js"],
]) {
  const built = await bundle({
    entryPoints: [source("packages/theme-contract/runtime/" + entry)],
    bundle: true, platform: "browser", format: "iife", target: "es2022",
    write: false, minify: false,
  });
  for (const name of ["js/" + asset, "admin/js/" + asset]) {
    const out = path.join(dest, name);
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(out, built.outputFiles[0].contents);
  }
}
await copy(source("packages/theme-contract/runtime/primetech/assets"), path.join(dest, "primetech"));
const atlas = await bundle({
  entryPoints: [source("packages/theme-contract/runtime/revise-atlas-browser.js")],
  bundle: true, platform: "browser", format: "iife", target: "es2022",
  write: false, minify: false,
});
for (const name of ["js/revise-atlas.js", "admin/js/revise-atlas.js"]) {
  const out = path.join(dest, name);
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, atlas.outputFiles[0].contents);
}
const revise = installed("@inneranimalmedia/revise-theme/dist");
const layout = installed("@inneranimalmedia/section-library/dist/layout.css");
await copy(revise, path.join(dest, "admin/theme-previews/revise"));
await copy(revise, path.join(dest, "theme-assets/revise"));
await copy(layout, path.join(dest, "admin/theme-previews/revise/layout.css"));
await copy(layout, path.join(dest, "theme-assets/revise/layout.css"));
const scoped = [
  "/* Reusable section layout remains scoped to its own host. */",
  ".ps-revise-atlas { min-width:0; isolation:isolate; }",
  "@scope (.ps-revise-atlas) {",
  await readFile(layout, "utf8"),
  await readFile(path.join(revise, "theme.css"), "utf8"),
  "}",
].join("\n");
for (const name of ["css/revise-atlas.css", "admin/css/revise-atlas.css"]) {
  const out = path.join(dest, name);
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, scoped);
}
for (const critical of [
  "admin/js/media-library.js", "admin/media-kit/index.js",
  "admin/workbench/media-asset-workbench.js",
  "admin/_spa/index.html", "admin/theme-editor.html",
  "admin/js/shell.js", "admin/js/inspector.js",
  "admin/js/revise-atlas.js", "admin/js/portable-sections.js", "admin/js/platform-stock-sections.js",
  "admin/js/primetech-scene.js", "admin/js/primetech-circuit.js", "js/primetech-scene.js", "js/primetech-circuit.js",
  "admin/js/theme-scenes-sections.js", "js/theme-scenes-sections.js",
  "admin/js/iamscene-runtime.js", "js/iamscene-runtime.js",
  "admin/css/theme-scenes-sections.css", "css/theme-scenes-sections.css",
  "primetech/companions/geaux.png", "primetech/companions/meaux.png",
  "primetech/scenes/original-4341/original-4341.iamscene.json",
  "admin/js/cms-authoring-engine.js", "admin/js/theme-preview-registry.js",
  "admin/js/theme-editor-mini-agentsam.mjs", "admin/js/theme-editor-assistant-context.mjs",
  "admin/dock/index.js", "admin/dock/dock.css", "admin/dock/dock.config.json",
  "admin/profile-popup/index.js",
]) {
  if (!fs.existsSync(path.join(dest, critical))) {
    throw new Error("Incomplete Ecommerce release: missing " + critical);
  }
}
// The old dashboard HTML/Babel export must not leak back into a portable CMS
// release alongside the supported React + shared analytics implementation.
if (fs.existsSync(path.join(dest, "admin/analytics"))) {
  throw new Error("Legacy analytics vendor tree was packaged alongside the reusable analytics SPA");
}
console.log("Ecommerce release assets assembled from app-local packages:", dest);

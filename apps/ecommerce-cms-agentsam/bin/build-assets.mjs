#!/usr/bin/env node
/** Standalone Ecommerce asset assembler. Only app-local and installed package inputs. */
import { cp, mkdir, rm, readFile, writeFile } from "node:fs/promises";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as bundle } from "esbuild";
import { execFileSync } from "node:child_process";

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
await copy(source("frontend/static"), path.join(dest, "admin"));
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
  "admin/js/revise-atlas.js", "admin/js/portable-sections.js",
  "admin/js/cms-authoring-engine.js", "admin/js/theme-preview-registry.js",
  "admin/dock/index.js", "admin/dock/dock.css", "admin/dock/dock.config.json",
  "admin/profile-popup/index.js",
]) {
  if (!fs.existsSync(path.join(dest, critical))) {
    throw new Error("Incomplete Ecommerce release: missing " + critical);
  }
}
console.log("Ecommerce release assets assembled from app-local packages:", dest);

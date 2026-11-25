#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_DIST = path.resolve(PACKAGE_ROOT, "../../apps/local-studio/desktop-dist");
const SCRIPT_TAG = '<script src="/desktop-api-fetch.js"></script>';

export function injectDesktopApiFetch(desktopDist = DEFAULT_DIST) {
  const root = path.resolve(desktopDist);
  const bootstrap = path.join(root, "desktop-api-fetch.js");
  if (!existsSync(bootstrap)) throw new Error("desktop_api_fetch_bootstrap_missing:" + bootstrap);
  if (!existsSync(path.join(root, "index.html"))) throw new Error("desktop_index_missing:" + root);

  let updated = 0;
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(file);
        continue;
      }
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".html")) continue;
      let html = readFileSync(file, "utf8");
      if (html.includes(SCRIPT_TAG)) continue;
      const moduleScript = /<script\b(?=[^>]*\btype=["']module["'])[^>]*>/i;
      if (moduleScript.test(html)) {
        html = html.replace(moduleScript, SCRIPT_TAG + "\n    $&");
      } else if (/<\/head>/i.test(html)) {
        html = html.replace(/<\/head>/i, SCRIPT_TAG + "\n  </head>");
      } else {
        html = SCRIPT_TAG + "\n" + html;
      }
      writeFileSync(file, html);
      updated += 1;
    }
  };
  visit(root);
  return updated;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const count = injectDesktopApiFetch(process.argv[2] || DEFAULT_DIST);
    console.log("[desktop-api-fetch] injected into " + count + " HTML entrypoints");
  } catch (error) {
    console.error("[desktop-api-fetch] " + (error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  }
}

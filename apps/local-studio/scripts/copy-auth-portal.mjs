#!/usr/bin/env node
// Copies the reusable identity auth-portal pages/shared assets into the
// build output so the Worker's ASSETS binding can serve /auth/login,
// /auth/signup, /auth/reset, and /shared/company-branding.js.
import { cpSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const portalRoot = path.resolve(appRoot, "../../packages/identity/src/frontend/auth-portal");
const outArg = process.argv.find((arg) => arg.startsWith("--out="))?.slice("--out=".length);
const desktopMode = process.argv.includes("--desktop");
const outPublic = path.resolve(appRoot, outArg || ".output/public");

if (!existsSync(outPublic)) {
  console.error(`[copy-auth-portal] build output missing at ${outPublic} — run vite build first.`);
  process.exit(1);
}

const pages = [
  ["pages/login.html", "auth/login.html"],
  ["pages/signup.html", "auth/signup.html"],
  ["pages/reset.html", "auth/reset.html"],
];

mkdirSync(path.join(outPublic, "auth"), { recursive: true });
mkdirSync(path.join(outPublic, "shared"), { recursive: true });

for (const [src, dest] of pages) {
  cpSync(path.join(portalRoot, src), path.join(outPublic, dest));
  console.log(`[copy-auth-portal] ${src} -> .output/public/${dest}`);
}

for (const shared of ["company-branding.js", "desktop-identity-bridge.js"]) {
  cpSync(
    path.join(portalRoot, "shared", shared),
    path.join(outPublic, "shared", shared),
  );
  console.log(`[copy-auth-portal] shared/${shared} -> ${path.relative(appRoot, outPublic)}/shared/${shared}`);
}

const markSource = path.resolve(appRoot, "../../packages/agentsam-desktop-shell/icons/local-studio/AgentSam-Mark.svg");
if (existsSync(markSource)) {
  cpSync(markSource, path.join(outPublic, "shared/agentsam-mark.svg"));
  console.log(`[copy-auth-portal] AgentSam mark -> ${path.relative(appRoot, outPublic)}/shared/agentsam-mark.svg`);
}

// Copy full public site tree into Worker assets (home/help/learn/global)
const siteSourceDir = path.join(appRoot, "frontend/public/site");
const siteDestDir = path.join(outPublic, "site");
if (!desktopMode && existsSync(siteSourceDir)) {
  mkdirSync(siteDestDir, { recursive: true });
  cpSync(siteSourceDir, siteDestDir, { recursive: true });
  console.log("[copy-auth-portal] frontend/public/site -> .output/public/site");

  // Keep legacy homepage.html as a full copy of home for older asset probes
  const homeIndex = path.join(siteDestDir, "home/index.html");
  if (existsSync(homeIndex)) {
    cpSync(homeIndex, path.join(siteDestDir, "homepage.html"));
    console.log("[copy-auth-portal] site/home/index.html -> site/homepage.html");
  }
}


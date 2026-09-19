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
const outPublic = path.resolve(appRoot, ".output/public");

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

cpSync(
  path.join(portalRoot, "shared/company-branding.js"),
  path.join(outPublic, "shared/company-branding.js"),
);
console.log("[copy-auth-portal] shared/company-branding.js -> .output/public/shared/company-branding.js");

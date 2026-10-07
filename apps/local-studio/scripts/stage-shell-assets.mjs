import { cp, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "frontend", "public");
const output = path.join(root, ".output", "public");

async function requireFile(relative) {
  const file = path.join(source, relative);
  const info = await stat(file);
  if (!info.isFile() || info.size === 0) {
    throw new Error("required shell asset is empty: " + relative);
  }
}

for (const relative of [
  "brand/agentsam-mark-on-dark.svg",
  "brand/agentsam-mark-on-light.svg",
  "brand/agentsam-mark.svg",
  "brand/agentsam-local-studio-icon.png",
  "favicon.svg",
  "__agentsam/pwa/icon-180.png",
  "__agentsam/pwa/icon-192.png",
  "__agentsam/pwa/icon-512.png",
]) {
  await requireFile(relative);
}

await mkdir(output, { recursive: true });
await cp(path.join(source, "brand"), path.join(output, "brand"), { recursive: true });
await cp(path.join(source, "favicon.svg"), path.join(output, "favicon.svg"));
await mkdir(path.join(output, "__agentsam", "pwa"), { recursive: true });
for (const name of ["icon-180.png", "icon-192.png", "icon-512.png"]) {
  await cp(
    path.join(source, "__agentsam", "pwa", name),
    path.join(output, "__agentsam", "pwa", name),
  );
}

console.log("[shell-assets] staged canonical AgentSam brand + favicon + PWA icons");

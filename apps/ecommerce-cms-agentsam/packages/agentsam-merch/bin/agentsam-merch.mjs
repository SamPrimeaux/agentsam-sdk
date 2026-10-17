#!/usr/bin/env node
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildMerchPlan,
  createManufacturingProfileRegistry,
} from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, "..");

async function readProfiles() {
  const profiles = [];
  const base = join(packageRoot, "profiles");
  for (const manufacturer of await readdir(base, { withFileTypes: true })) {
    if (!manufacturer.isDirectory()) continue;
    const dir = join(base, manufacturer.name);
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      profiles.push(JSON.parse(await readFile(join(dir, entry.name), "utf8")));
    }
  }
  return profiles;
}

function statusLabel(status) {
  return {
    ready: "READY",
    ready_with_transform: "READY / TRANSFORM",
    needs_variant: "NEEDS VARIANT",
    prepared_for_digitization: "PREPARED FOR DIGITIZATION",
    unsupported: "UNSUPPORTED",
  }[status] || String(status).toUpperCase();
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "merch") args.shift();
  const command = args.shift();

  const registry = createManufacturingProfileRegistry(await readProfiles());

  if (command === "profiles") {
    for (const profile of registry.list()) {
      console.log(`${profile.id}\t${profile.manufacturer}\t${profile.process}\t${profile.format}`);
    }
    return;
  }

  if (command !== "build") {
    console.error("Usage: agentsam-merch [merch] build <manifest.json> [--all-compatible]");
    console.error("       agentsam-merch profiles");
    process.exitCode = 2;
    return;
  }

  const manifestPath = args.find((arg) => !arg.startsWith("--"));
  if (!manifestPath) throw new Error("build requires a manifest JSON path");

  const manifest = JSON.parse(await readFile(resolve(manifestPath), "utf8"));
  const plan = buildMerchPlan({ ...manifest, registry });

  console.log(`Design: ${plan.design.id || plan.design.name || "unnamed"}`);
  console.log("");
  console.log("Compatible products");

  for (const target of plan.targets) {
    const compatibility = target.derivatives?.manufacturing?.compatibility;
    const notes = [];
    if (compatibility?.requirementsVerified === false) notes.push("PROFILE UNVERIFIED");
    if (compatibility?.issues?.[0]?.message) notes.push(compatibility.issues[0].message);
    console.log(
      `${String(target.name || target.id).padEnd(30)} ${statusLabel(target.status)}${notes.length ? ` · ${notes.join(" · ")}` : ""}`,
    );
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});

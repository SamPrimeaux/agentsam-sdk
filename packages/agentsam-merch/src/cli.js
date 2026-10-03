import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildMerchPlan,
  createManufacturingProfileRegistry,
} from "./index.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export async function readBundledProfiles(root = packageRoot) {
  const profiles = [];
  const base = join(root, "profiles");
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

export function merchStatusLabel(status) {
  return {
    ready: "READY",
    ready_with_warning: "READY / WARNING",
    ready_with_transform: "READY / TRANSFORM",
    needs_variant: "NEEDS VARIANT",
    prepared_for_digitization: "PREPARED FOR DIGITIZATION",
    unsupported: "UNSUPPORTED",
  }[status] || String(status).toUpperCase();
}

export async function runMerchCli(
  argv = [],
  { write = (value) => process.stdout.write(value), profileRoot = packageRoot } = {},
) {
  const args = [...argv];
  if (args[0] === "merch") args.shift();
  const command = args.shift();
  const registry = createManufacturingProfileRegistry(
    await readBundledProfiles(profileRoot),
  );

  if (command === "profiles") {
    const rows = registry.list();
    for (const profile of rows) {
      write(
        `${profile.id}\t${profile.manufacturer}\t${profile.process}\t${profile.format}\n`,
      );
    }
    return { command, profiles: rows };
  }

  if (command !== "build") {
    const error = new Error(
      "Usage: agentsam merch build <manifest.json> [--all-compatible]\n" +
        "       agentsam merch profiles",
    );
    error.code = "AGENTSAM_MERCH_USAGE";
    throw error;
  }

  const manifestPath = args.find((arg) => !arg.startsWith("--"));
  if (!manifestPath) {
    const error = new Error("agentsam merch build requires a manifest JSON path");
    error.code = "AGENTSAM_MERCH_MANIFEST_REQUIRED";
    throw error;
  }

  const manifest = JSON.parse(await readFile(resolve(manifestPath), "utf8"));
  const plan = buildMerchPlan({ ...manifest, registry });

  write(`Design: ${plan.design.id || plan.design.name || "unnamed"}\n\n`);
  write("Compatible products\n");
  for (const target of plan.targets) {
    const compatibility = target.derivatives?.manufacturing?.compatibility;
    const notes = [];
    if (compatibility?.requirementsVerified === false) notes.push("PROFILE UNVERIFIED");
    if (compatibility?.issues?.[0]?.message) {
      notes.push(compatibility.issues[0].message);
    }
    write(
      `${String(target.name || target.id).padEnd(30)} ${merchStatusLabel(
        target.status,
      )}${notes.length ? ` · ${notes.join(" · ")}` : ""}\n`,
    );
  }

  return { command, manifestPath: resolve(manifestPath), plan };
}

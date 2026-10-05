import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const pkgPath = path.join(root, "packages/agentsam-workbench/package.json");
const rootPkgPath = path.join(root, "package.json");

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, "utf8"));

let failed = false;

const fail = (message) => {
  failed = true;
  console.error(`FAIL: ${message}`);
};

const pass = (message) => {
  console.log(`PASS: ${message}`);
};

if (pkg.name !== "@inneranimalmedia/agentsam-workbench") {
  fail("unexpected workbench package name");
} else {
  pass("canonical workbench package identified");
}

if (pkg.version !== rootPkg.version) {
  fail(`workbench ${pkg.version} != release train ${rootPkg.version}`);
} else {
  pass(`release train version aligned at ${pkg.version}`);
}

const exportsMap = pkg.exports || {};

if (!exportsMap["./widgets"]) {
  fail("package export ./widgets is missing");
} else {
  pass("./widgets package export exists");
}

if (!exportsMap["./widgets/widgets.css"]) {
  fail("package export ./widgets/widgets.css is missing");
} else {
  pass("./widgets/widgets.css package export exists");
}

console.log("\nBuilding workbench...");
execFileSync(
  "npm",
  ["run", "build", "--workspace", "@inneranimalmedia/agentsam-workbench"],
  { cwd: root, stdio: "inherit" },
);

for (const rel of [
  "packages/agentsam-workbench/dist/widgets/index.js",
  "packages/agentsam-workbench/dist/widgets/index.d.ts",
  "packages/agentsam-workbench/dist/widgets/widgets.css",
]) {
  if (!fs.existsSync(path.join(root, rel))) {
    fail(`built artifact missing: ${rel}`);
  } else {
    pass(`built artifact exists: ${rel}`);
  }
}

console.log("\nRunning npm pack dry-run...");
const dryRun = JSON.parse(
  execFileSync(
    "npm",
    [
      "pack",
      "--dry-run",
      "--json",
      "--workspace",
      "@inneranimalmedia/agentsam-workbench",
    ],
    { cwd: root, encoding: "utf8" },
  ),
);

const files = new Set((dryRun[0]?.files || []).map((entry) => entry.path));

for (const rel of [
  "dist/widgets/index.js",
  "dist/widgets/index.d.ts",
  "dist/widgets/widgets.css",
]) {
  if (!files.has(rel)) {
    fail("npm tarball would omit " + rel);
  } else {
    pass("npm tarball includes " + rel);
  }
}

console.log("\\nPacking local first-party dependency closure...");

const workspacePackages = new Map();
for (const base of ["packages", "apps"]) {
  const basePath = path.join(root, base);
  if (!fs.existsSync(basePath)) continue;
  for (const entry of fs.readdirSync(basePath, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(basePath, entry.name, "package.json");
    if (!fs.existsSync(manifestPath)) continue;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (typeof manifest.name === "string" && manifest.name.startsWith("@inneranimalmedia/")) {
      workspacePackages.set(manifest.name, { manifest, dir: path.dirname(manifestPath) });
    }
  }
}

const collectFirstPartyClosure = (name, seen = new Set()) => {
  if (seen.has(name)) return seen;
  const record = workspacePackages.get(name);
  if (!record) return seen;
  seen.add(name);
  const sections = [
    record.manifest.dependencies || {},
    record.manifest.optionalDependencies || {},
    record.manifest.peerDependencies || {},
  ];
  for (const deps of sections) {
    for (const depName of Object.keys(deps)) {
      if (workspacePackages.has(depName)) collectFirstPartyClosure(depName, seen);
    }
  }
  return seen;
};

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentsam-widget-pack-"));
const closure = [...collectFirstPartyClosure("@inneranimalmedia/agentsam-workbench")];
const tarballs = [];

for (const name of closure) {
  const record = workspacePackages.get(name);
  if (!record) continue;
  const packedJson = JSON.parse(
    execFileSync(
      "npm",
      ["pack", "--json", "--pack-destination", tempRoot],
      { cwd: record.dir, encoding: "utf8" },
    ),
  );
  const filename = packedJson[0]?.filename;
  if (!filename) {
    fail("npm pack did not return a tarball filename for " + name);
    continue;
  }
  tarballs.push(path.join(tempRoot, filename));
  pass("packed local first-party dependency: " + name);
}

console.log("\\nInstalling isolated consumer from local tarballs...");
const consumerDir = path.join(tempRoot, "consumer");
fs.mkdirSync(consumerDir, { recursive: true });
fs.writeFileSync(
  path.join(consumerDir, "package.json"),
  JSON.stringify({ name: "agentsam-widget-pack-smoke", private: true, type: "module" }, null, 2) + "\n",
);

const cleanNpmEnv = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key]) => key.toLowerCase() !== "npm_config_allow_scripts",
  ),
);

execFileSync(
  "npm",
  [
    "install",
    "--userconfig",
    "/dev/null",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    ...tarballs,
    "react@^19.0.0",
    "react-dom@^19.0.0",
  ],
  { cwd: consumerDir, stdio: "inherit", env: cleanNpmEnv },
);

fs.writeFileSync(
  path.join(consumerDir, "smoke.mjs"),
  [
    'import * as widgets from "@inneranimalmedia/agentsam-workbench/widgets";',
    "const keys = Object.keys(widgets);",
    'if (!keys.length) throw new Error("widget export is empty");',
    'console.log("PASS: isolated tarball consumer imported widget package");',
    "console.log(keys.sort());",
    "",
  ].join("\n"),
);

execFileSync("node", ["smoke.mjs"], { cwd: consumerDir, stdio: "inherit" });
pass("isolated tarball consumer imported ./widgets successfully");

const exampleRoot = path.join(root, "examples/widget-consumer");

if (!fs.existsSync(exampleRoot)) {
  fail("examples/widget-consumer missing; portable consumer proof is required");
} else {
  pass("portable widget consumer fixture exists");

  const sourceFiles = [];
  const scan = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) scan(full);
      else if (/\.(mjs|cjs|js|jsx|ts|tsx)$/.test(entry.name)) sourceFiles.push(full);
    }
  };

  scan(exampleRoot);

  for (const file of sourceFiles) {
    const source = fs.readFileSync(file, "utf8");
    for (const forbidden of [
      "apps/local-studio/",
      "packages/agentsam-workbench/src/",
      "donor-weather-platform/",
    ]) {
      if (source.includes(forbidden)) {
        fail(`portable example reaches into forbidden source: ${file} -> ${forbidden}`);
      }
    }
  }
}

if (failed) {
  console.error("\nWidget platform verification FAILED.");
  process.exit(1);
}

console.log("\nWidget platform verification PASSED.");

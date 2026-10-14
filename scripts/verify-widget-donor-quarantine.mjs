import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const workbenchRoot = path.join(root, "packages/agentsam-workbench");
const donorRoot = path.join(workbenchRoot, "donor");
const srcRoot = path.join(workbenchRoot, "src");
const forbiddenFragments = [
  "/donor/",
  "donor-weather-platform",
  "weather-widget-platform",
  "agentsamweatherwidget-audit",
];

let failed = false;
const fail = (message) => {
  failed = true;
  console.error(`FAIL: ${message}`);
};
const pass = (message) => console.log(`PASS: ${message}`);

const scanFiles = (dir, out = []) => {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", "dist", "build", ".git"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) scanFiles(full, out);
    else out.push(full);
  }
  return out;
};

for (const file of scanFiles(srcRoot)) {
  if (!/\.(ts|tsx|js|jsx|mjs|cjs|css|json|md)$/.test(file)) continue;
  const source = fs.readFileSync(file, "utf8");
  for (const fragment of forbiddenFragments) {
    if (source.includes(fragment)) {
      fail(`production source references donor material: ${path.relative(root, file)} -> ${fragment}`);
    }
  }
}

const pack = JSON.parse(
  execFileSync(
    "npm",
    ["pack", "--dry-run", "--ignore-scripts", "--json", "--workspace", "@inneranimalmedia/agentsam-workbench"],
    { cwd: root, encoding: "utf8" },
  ),
);

const packedFiles = (pack[0]?.files || []).map((entry) => entry.path);
const leaked = packedFiles.filter((file) =>
  /(^|\/)(donor|donors)(\/|$)|weather-widget-platform|donor-weather-platform/i.test(file)
);

if (leaked.length) {
  for (const file of leaked) fail(`donor material would ship in npm tarball: ${file}`);
} else {
  pass("npm tarball contains no donor/reference material");
}

const pkg = JSON.parse(
  fs.readFileSync(path.join(workbenchRoot, "package.json"), "utf8"),
);

const declaredFiles = pkg.files || [];
if (declaredFiles.some((entry) => /donor/i.test(entry))) {
  fail("package.json files allowlist includes donor material");
} else {
  pass("package.json files allowlist excludes donor material");
}

if (donorRoot.startsWith(srcRoot + path.sep)) {
  fail("donor staging directory is inside compiled production source");
} else {
  pass("donor staging directory is outside compiled production source");
}

if (failed) process.exit(1);
console.log("PASS: donor material is quarantined from production/package output");

import fs from "node:fs";
import path from "node:path";

// Read-only source/package boundary diagnostic. The bundler and clean-room build
// remain the final authority for all forms of dynamic resolution.
const SOURCES = /\.(?:[cm]?js|jsx|[cm]?ts|tsx)$/i;
const IGNORED = new Set(["node_modules", ".git", ".wrangler", "dist", "build", "coverage", ".next", "test-results", "test", "tests", "fixtures"]);
function within(root, target) {
  return target === root || target.startsWith(root + path.sep);
}
function issue(file, kind, reference, detail) {
  return { file, kind, reference, detail };
}
export function inspectPackageBoundaries(appRoot) {
  const root = fs.realpathSync(path.resolve(appRoot));
  const issues = [];
  let scannedFiles = 0;
  let scannedManifests = 0;
  function checkManifest(abs) {
    scannedManifests++;
    const relative = path.relative(root, abs);
    let pkg;
    try { pkg = JSON.parse(fs.readFileSync(abs, "utf8")); }
    catch (error) {
      issues.push(issue(relative, "invalid_manifest", "", String(error.message)));
      return;
    }
    for (const group of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
      for (const [name, spec] of Object.entries(pkg[group] || {})) {
        if (typeof spec !== "string") continue;
        if (spec.startsWith("file:") || spec.startsWith("link:")) {
          const target = path.resolve(path.dirname(abs), spec.replace(/^(?:file:|link:)/, ""));
          if (!within(root, target)) issues.push(issue(relative, "external_dependency", name, spec));
          else if (!fs.existsSync(target)) issues.push(issue(relative, "missing_local_dependency", name, spec));
        } else if (spec.startsWith("workspace:")) {
          issues.push(issue(relative, "workspace_resolution_unverified", name, spec));
        }
      }
    }
  }
  function checkSource(abs) {
    scannedFiles++;
    const relative = path.relative(root, abs);
    const src = fs.readFileSync(abs, "utf8");
    // Static/dynamic literal ES imports and CommonJS requires.
    const refs = [
      /\b(?:import|export)\s+(?:type\s+)?(?:[^;\n]*?\s+from\s*)?["']([^"'\n]+)["']/g,
      /\b(?:import|require)\s*\(\s*["']([^"'\n]+)["']\s*\)/g,
    ];
    const seen = new Set();
    for (const re of refs) {
      for (const match of src.matchAll(re)) {
        const spec = match[1];
        if (seen.has(spec)) continue;
        seen.add(spec);
        if (spec.startsWith(".")) {
          const target = path.resolve(path.dirname(abs), spec);
          if (!within(root, target)) issues.push(issue(relative, "escaping_import", spec, path.relative(root, target)));
        } else if (/^\/(?:Users|home|private|opt|mnt|Volumes)(?:\/|$)/.test(spec) || /^[A-Za-z]:[\\/]/.test(spec)) {
          issues.push(issue(relative, "absolute_import", spec, "Developer-machine filesystem import"));
        }
      }
    }
  }
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (IGNORED.has(entry.name)) continue;
      const abs = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        const target = fs.realpathSync(abs);
        if (!within(root, target)) issues.push(issue(path.relative(root, abs), "external_symlink", entry.name, target));
        continue;
      }
      if (entry.isDirectory()) { walk(abs); continue; }
      if (!entry.isFile()) continue;
      if (entry.name === "package.json") checkManifest(abs);
      else if (SOURCES.test(entry.name)) checkSource(abs);
    }
  }
  walk(root);
  issues.sort((a, b) => (a.file + a.kind + a.reference).localeCompare(b.file + b.kind + b.reference));
  return { root, scanned_files: scannedFiles, scanned_manifests: scannedManifests, boundary_ready: issues.length === 0, issues };
}

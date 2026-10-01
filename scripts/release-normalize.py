#!/usr/bin/env python3
"""Normalize every @inneranimalmedia package for lockstep publishing (stdlib only).

  python3 scripts/release-normalize.py           dry run: prints the plan, changes nothing
  python3 scripts/release-normalize.py --write   applies it
  python3 scripts/release-normalize.py --check   CI gate: exits 1 on any violation

Policy lives in the constants below, so it is reviewed in git like any other code.
"""
import fnmatch, json, os, re, sys

SCOPE = "@inneranimalmedia/"
REPO_URL = "git+https://github.com/SamPrimeaux/agentsam-sdk.git"
SKIP = {"node_modules", ".git", ".output", "dist", "target", "desktop-dist", ".agentsam", "build", "coverage"}
# apps/README.md law: apps are their own npm workspace roots (NOT in the SDK root workspace graph);
# frontend/backend/shared are app-internal and get bundled into the app package, so they stay private.
# Only packages/* and the app root packages are published.
PRIVATE_GLOBS = ["apps/*-site", "apps/project-control", "apps/*/frontend", "apps/*/backend", "apps/*/shared/*"]
# Consumed by ANOTHER app (ecommerce depends on these), so they must be installable from the registry.
# Promote them to packages/* when you can; until then they publish with a warning.
PUBLISH_EXTRA = {"apps/client-cms-editor/shared/cms", "apps/client-cms-editor/frontend", "apps/client-cms-editor/backend"}
DEP_SECTIONS = ("dependencies", "devDependencies", "peerDependencies", "optionalDependencies")
ROOT = os.getcwd()
WRITE, CHECK = "--write" in sys.argv, "--check" in sys.argv


def indent_of(text):
    m = re.search(r"\n([ \t]+)\S", text)
    return m.group(1) if m else "  "


def read(path):
    text = open(path, encoding="utf-8").read()
    return json.loads(text), indent_of(text)


def write(path, data, indent):
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(json.dumps(data, indent=indent, ensure_ascii=False) + "\n")


def semver_key(v):
    m = re.match(r"(\d+)\.(\d+)\.(\d+)(?:-(.+))?$", v or "")
    if not m:
        return (0, 0, 0, 0, "")
    pre = m.group(4)
    return (int(m.group(1)), int(m.group(2)), int(m.group(3)), 0 if pre else 1, pre or "")


def discover():
    out = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP and not d.startswith(".")]
        if "package.json" not in filenames:
            continue
        path = os.path.join(dirpath, "package.json")
        try:
            data, indent = read(path)
        except Exception:
            continue
        if str(data.get("name", "")).startswith(SCOPE):
            out.append((os.path.relpath(dirpath, ROOT), path, data, indent))
    return sorted(out)


def public_files(data, rel):
    """Ship exactly what the package declares public (exports/main/module/types/bin) + src."""
    paths = []

    def walk(node):
        if isinstance(node, str):
            paths.append(node)
        elif isinstance(node, dict):
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)

    for key in ("exports", "main", "module", "types", "bin"):
        walk(data.get(key))
    tops = {re.sub(r"^\./", "", p).split("/")[0] for p in paths}
    tops.discard("")
    if os.path.isdir(os.path.join(ROOT, rel, "src")):
        tops.add("src")
    return sorted(t for t in tops if os.path.exists(os.path.join(ROOT, rel, t)))


def main():
    pkgs = discover()
    names = [d["name"] for _, _, d, _ in pkgs]
    dupes = {n for n in names if names.count(n) > 1}
    if dupes:
        sys.exit(f"duplicate package names: {sorted(dupes)}")
    internal = set(names)
    baseline = max((d.get("version", "0.0.0") for _, _, d, _ in pkgs), key=semver_key)
    caret = "^" + baseline
    violations, rows, review = [], [], []

    for rel, path, data, indent in pkgs:
        is_root = rel == "."
        private = (not is_root) and rel not in PUBLISH_EXTRA and any(fnmatch.fnmatch(rel, g) for g in PRIVATE_GLOBS)
        notes = []
        if data.get("version") != baseline:
            notes.append(f"version {data.get('version')} -> {baseline}")
            data["version"] = baseline
        if private != bool(data.get("private")):
            notes.append("private -> true" if private else "private -> removed")
            if private:
                data["private"] = True
            else:
                data.pop("private", None)
        for sect in DEP_SECTIONS:
            for dep, spec in list((data.get(sect) or {}).items()):
                if dep not in internal and re.match(r"^(file:|link:)", spec or ""):
                    violations.append(f"{rel}: {dep}@{spec} points at a local path")
                if dep in internal and spec != caret:
                    notes.append(f"{dep.split('/')[1]}@{spec} -> {caret}")
                    data[sect][dep] = caret
        if not private:
            if (data.get("publishConfig") or {}).get("access") != "public":
                data.setdefault("publishConfig", {})["access"] = "public"
                notes.append("publishConfig.access=public")
            if not data.get("repository"):
                data["repository"] = {"type": "git", "url": REPO_URL, **({} if is_root else {"directory": rel})}
                notes.append("repository added")
            if not data.get("files"):
                files = public_files(data, rel)
                if files:
                    data["files"] = files
                    notes.append(f"files={files}")
                else:
                    # Fail safe: never let a package with no `files` list reach `changeset publish`.
                    data["private"] = True
                    notes.append("HELD private: no `files` derivable; set `files` by hand")
                    violations.append(f"{rel}: no files derivable; set `files` by hand")
            if rel.startswith("apps/"):
                review.append(rel + ("   (PROMOTE to packages/*: another app consumes it)" if rel in PUBLISH_EXTRA else ""))
        rows.append((rel, data["name"], "private" if private else "PUBLISH", notes))
        if WRITE and notes:
            write(path, data, indent)

    # Workspaces + lockstep group so npm links every package and changesets versions them together.
    root_rel, root_path, root, root_indent = next(p for p in pkgs if p[0] == ".")
    ws = sorted(rel for rel, *_ in pkgs if rel.startswith("packages/"))  # apps stay out (apps/README.md)
    if root.get("workspaces") != ws:
        rows.append((".", "(root workspaces)", "", [f"{len(root.get('workspaces') or [])} -> {len(ws)} entries"]))
        root["workspaces"] = ws
        if WRITE:
            write(root_path, root, root_indent)
    cs_path = os.path.join(ROOT, ".changeset", "config.json")
    if os.path.exists(cs_path):
        cs, cs_indent = read(cs_path)
        group = [[SCOPE + "*"]]
        if cs.get("fixed") != group:
            rows.append((".changeset/config.json", "fixed", "", ["fixed -> [[@inneranimalmedia/*]]"]))
            cs["fixed"] = group
            if WRITE:
                write(cs_path, cs, cs_indent)

    if CHECK:
        for rel, name, kind, notes in rows:
            if notes:
                violations.append(f"{rel}: drifts from lockstep policy ({len(notes)} change(s) pending)")

    mode = "WROTE" if WRITE else "DRY RUN"
    print(f"{mode}: {len(pkgs)} packages, lockstep baseline {baseline}\n")
    for rel, name, kind, notes in rows:
        if notes or kind:
            print(f"{kind:8} {rel:46} {name}")
            for n in notes:
                print(f"           - {n}")
    if review:
        print("\nREVIEW `files` by hand (apps ship built output, not just declared entries):")
        for r in review:
            print("  ", r)
    if violations and (CHECK or WRITE):
        print("\nVIOLATIONS:")
        for v in violations:
            print("  ", v)
    if CHECK and violations:
        sys.exit(1)


if __name__ == "__main__":
    main()

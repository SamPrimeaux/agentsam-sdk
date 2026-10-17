#!/usr/bin/env python3
"""
walk_capabilities.py  (stdlib only, read-only)

Walks an agentsam-sdk checkout and finds EVERY capability declaration, whatever
shape it is declared in, then proposes where each one belongs on the
surface.object.interaction grid. It never edits the repo.

  python3 walk_capabilities.py /path/to/agentsam-sdk --out ./capability-report

Writes:
  inventory.json   every declaration (id, family, owner, file:line, side effects)
  inventory.csv    same, for sorting
  alignment.md     per-surface coverage, unmapped ids, duplicates across families
"""
import argparse, csv, json, os, re, sys
from collections import defaultdict

SKIP_DIRS = {".git", "node_modules", "dist", "build", ".wrangler", ".next", "target", "__pycache__", ".turbo", "coverage"}
TEXT_EXT = {".js", ".mjs", ".cjs", ".ts", ".tsx", ".json", ".jsonc", ".yaml", ".yml", ".go", ".py", ".rs", ".md"}
MAX_BYTES = 2_000_000

# --- proposed grid. domain/verb -> surface ; keeps ONE vocabulary (matches product-capabilities.ts) ---
SURFACES = ["studio", "collection", "storefront", "checkout", "install", "template", "automation", "fulfillment",
            "cms", "media", "mail", "campaign", "workspace", "database", "repository", "cloudflare", "cad", "agent", "identity"]
DOMAIN_TO_SURFACE = {
    "commerce": "storefront", "catalog": "storefront", "product": "studio", "order": "fulfillment",
    "design": "studio", "theme": "template", "template": "template", "section": "template",
    "cms": "cms", "page": "cms", "media": "media", "asset": "media", "image": "media", "brand": "media",
    "mail": "mail", "email": "mail", "campaign": "campaign", "growth": "campaign",
    "terminal": "workspace", "workspace": "workspace", "file": "workspace", "files": "workspace", "project": "workspace",
    "database": "database", "d1": "database", "repository": "repository", "repo": "repository", "workgraph": "automation",
    "planning": "automation", "automation": "automation", "workflow": "automation",
    "cloudflare": "cloudflare", "cad": "cad", "robotics": "cad", "models": "cad",
    "agent": "agent", "identity": "identity", "app": "install", "install": "install", "delivery": "install",
    "integrity": "repository", "security": "repository", "web": "workspace", "tool": "agent",
}
VERB_TO_INTERACTION = [
    (r"(search|read|get|list|inspect|view|snapshot|status|discover|query|schema)", "view"),
    (r"(create|write|edit|update|patch|set|save|sync|index)", "edit"),
    (r"(generate|render|mockup|compile|build)", "generate"),
    (r"(publish|deploy|release)", "publish"),
    (r"(run|exec|start|invoke|execute|spawn|test)", "run"),
    (r"(send|submit|quote)", "submit"),
    (r"(purchase|pay|checkout)", "purchase"),
    (r"(install|apply|grant)", "apply"),
]

Decl = dict


def rel(p, root): return os.path.relpath(p, root).replace(os.sep, "/")


def owner_of(path):
    """apps/<x> or packages/<x> or src/<area> or protocol/<area> -> owner label."""
    parts = path.split("/")
    if parts[0] in ("apps", "packages", "skills") and len(parts) > 1: return f"{parts[0]}/{parts[1]}"
    if parts[0] in ("src", "protocol") and len(parts) > 1: return f"{parts[0]}/{parts[1]}"
    return parts[0]


def line_of(text, idx): return text.count("\n", 0, idx) + 1


def add(out, **kw):
    kw.setdefault("domain", None); kw.setdefault("verb", None); kw.setdefault("side_effects", None)
    kw.setdefault("mutating", None); kw.setdefault("status", None); kw.setdefault("description", None)
    out.append(kw)


# ---------- extractors (one per declaration family) ----------

def from_protocol_manifest(path, text, root, out):
    try: d = json.loads(text)
    except Exception: return
    caps = d.get("capabilities")
    if isinstance(caps, dict) and any(isinstance(v, dict) and "id" in v for v in caps.values()):
        for k, v in caps.items():
            if not isinstance(v, dict): continue
            se = v.get("side_effects")
            add(out, id=v.get("id", k), family="protocol-manifest", file=path, line=None, owner="protocol/capabilities",
                domain=v.get("domain"), side_effects=se, status=v.get("status"), description=(v.get("description") or "")[:140],
                mutating=(se not in (None, "none", "network-read", "filesystem-read")) if isinstance(se, str) else None)


def walk_json_capabilities(node, path, out, ctx):
    """Any JSON object with a `capabilities` key: array of strings/objects, or {name:{...}}."""
    if isinstance(node, dict):
        for k, v in node.items():
            if k in ("capabilities", "capability") and k == "capabilities":
                if isinstance(v, list):
                    for it in v:
                        if isinstance(it, str):
                            add(out, id=it, family=ctx, file=path, line=None, owner=owner_of(path))
                        elif isinstance(it, dict):
                            cid = it.get("capability_key") or it.get("id") or it.get("name") or it.get("key")
                            if cid: add(out, id=str(cid), family=ctx, file=path, line=None, owner=owner_of(path),
                                        domain=it.get("domain"), verb=it.get("verb"), mutating=it.get("is_mutating"),
                                        description=(it.get("description") or "")[:140])
                elif isinstance(v, dict) and ctx != "protocol-manifest":
                    for kk, vv in v.items():
                        if isinstance(vv, list) and all(isinstance(x, str) for x in vv):  # yaml-like groups
                            for x in vv: add(out, id=f"{kk}.{x}", family=ctx, file=path, line=None, owner=owner_of(path), domain=kk)
                        elif isinstance(vv, (dict, bool, str)) and kk not in ("id", "name"):
                            add(out, id=kk, family=ctx, file=path, line=None, owner=owner_of(path))
            else:
                walk_json_capabilities(v, path, out, ctx)
    elif isinstance(node, list):
        for it in node: walk_json_capabilities(it, path, out, ctx)


NOISE_IDS = {"$ref", "additionalProperties", "properties", "type", "items", "required", "enum", "description", "default"}


def from_json(path, text, root, out):
    base = os.path.basename(path)
    try: d = json.loads(re.sub(r"^\s*//.*$", "", text, flags=re.M))
    except Exception: return
    if path.startswith("protocol/capabilities/manifest.json"): return from_protocol_manifest(path, text, root, out)
    fam = ("app-manifest" if base in ("agentsam.app.json", "app.json") else
           "package-manifest" if base == "agentsam.package.json" else
           "skill-manifest" if base.endswith("skill.json") else
           "tool-manifest" if base == "tool.json" else
           "generated-inventory" if "registry/generated" in path else "json-other")
    before = len(out)
    walk_json_capabilities(d, path, out, fam)
    out[before:] = [x for x in out[before:] if x["id"] not in NOISE_IDS and not x["id"].startswith("$")]
    if fam == "tool-manifest" and isinstance(d, dict) and d.get("name"):
        add(out, id=f"tool.{d['name']}", family="tool-manifest", file=path, line=None, owner=owner_of(path), description=(d.get("description") or "")[:140])
    if fam in ("app-manifest",) and isinstance(d, dict):  # surfaces + provides are interaction surfaces, not capabilities: record separately
        for s in d.get("surfaces", []) or []:
            if isinstance(s, str): add(out, id=f"surface:{s}", family="app-surface", file=path, line=None, owner=owner_of(path))
        for s in d.get("provides", []) or []:
            if isinstance(s, str): add(out, id=f"provides:{s}", family="app-provides", file=path, line=None, owner=owner_of(path))


def from_yaml(path, text, root, out):
    # minimal reader for the `capabilities:` block (group: [- item])
    m = re.search(r"^capabilities:\s*\n((?:[ \t]+.*\n?|\n)+)", text, re.M)
    if not m: return
    grp = None; start = line_of(text, m.start(1))
    for i, ln in enumerate(m.group(1).splitlines()):
        g = re.match(r"^\s{2}([\w.-]+):\s*$", ln); it = re.match(r"^\s{4}-\s*([\w.:-]+)", ln)
        if g: grp = g.group(1)
        elif it and grp: add(out, id=f"{grp}.{it.group(1)}", family="yaml-capabilities", file=path, line=start + i, owner=owner_of(path), domain=grp)


RX_KEY = re.compile(r"""capability_key\s*[:=]\s*['"]([\w.:-]+)['"]""")
RX_KEY_ROW = re.compile(r"""\{\s*capability_key\s*:\s*['"]([\w.:-]+)['"]\s*,\s*domain\s*:\s*['"]([\w-]+)['"]\s*,\s*verb\s*:\s*['"]([\w-]+)['"](?:[^}]*?is_mutating\s*:\s*(true|false))?""")
RX_CAPID = re.compile(r"""\b(?:capabilityId|capability_id|capabilityKey)\s*[:=]\s*['"]([\w.:-]+)['"]""")
RX_TYPE_UNION = re.compile(r"""type\s+(\w*Capabilit\w*)\s*=\s*((?:\s*\|?\s*['"][\w.:-]+['"])+)""")
RX_EXEC_ID = re.compile(r"""^\s*\[\s*['"]([a-z][\w]*(?:\.[\w]+)+)['"]\s*,\s*(?:async\s*)?\(""", re.M)
RX_ARR = re.compile(r"""\bcapabilities\s*[:=]\s*\[([^\]]{1,2000})\]""")


def from_code(path, text, root, out):
    owner = owner_of(path)
    seen_rows = set()
    for m in RX_KEY_ROW.finditer(text):
        seen_rows.add(m.group(1))
        add(out, id=m.group(1), family="plugin-capability", file=path, line=line_of(text, m.start()), owner=owner,
            domain=m.group(2), verb=m.group(3), mutating=(m.group(4) == "true") if m.group(4) else None)
    for m in RX_KEY.finditer(text):
        if m.group(1) not in seen_rows:
            add(out, id=m.group(1), family="plugin-capability-ref", file=path, line=line_of(text, m.start()), owner=owner)
    for m in RX_CAPID.finditer(text):
        add(out, id=m.group(1), family="capability-id-ref", file=path, line=line_of(text, m.start()), owner=owner)
    for m in RX_TYPE_UNION.finditer(text):
        if "Error" in m.group(1): continue
        for s in re.findall(r"""['"]([\w.:-]+)['"]""", m.group(2)):
            add(out, id=s, family=f"ts-union:{m.group(1)}", file=path, line=line_of(text, m.start()), owner=owner)
    if "capability-adapter" in path or "capabilities/index" in path:
        for m in RX_EXEC_ID.finditer(text):
            add(out, id=m.group(1), family="executable-handler", file=path, line=line_of(text, m.start()), owner=owner)
    for m in RX_ARR.finditer(text):
        for s in re.findall(r"""['"]([\w.:-]+)['"]""", m.group(1)):
            add(out, id=s, family="inline-capabilities-array", file=path, line=line_of(text, m.start()), owner=owner)


def scan(root):
    out, files = [], 0
    for dp, dns, fns in os.walk(root):
        dns[:] = [d for d in dns if d not in SKIP_DIRS]
        for fn in fns:
            ext = os.path.splitext(fn)[1].lower()
            if ext not in TEXT_EXT: continue
            full = os.path.join(dp, fn)
            try:
                if os.path.getsize(full) > MAX_BYTES: continue
                text = open(full, encoding="utf-8", errors="ignore").read()
            except OSError: continue
            p = rel(full, root); files += 1
            if fn.endswith(".schema.json") or "/test/" in "/" + rel(full, root) or ".test." in fn: continue
            if ext in (".json", ".jsonc"):
                if "capabilit" in text or fn == "tool.json": from_json(p, text, root, out)
            elif ext in (".yaml", ".yml"):
                from_yaml(p, text, root, out)
            elif ext in (".js", ".mjs", ".cjs", ".ts", ".tsx", ".go", ".py", ".rs"):
                if re.search(r"capabilit", text, re.I): from_code(p, text, root, out)
    return out, files


# ---------- alignment ----------

def propose(d):
    cid = d["id"]
    if cid.startswith(("surface:", "provides:")): return None, None
    dom = (d.get("domain") or "").lower()
    head = re.split(r"[._:-]", cid)[0].lower()
    surface = DOMAIN_TO_SURFACE.get(dom) or DOMAIN_TO_SURFACE.get(head)
    verb = (d.get("verb") or re.split(r"[._:-]", cid)[-1]).lower()
    inter = next((i for rx, i in VERB_TO_INTERACTION if re.search(rx, verb)), None)
    if d.get("mutating") is True and inter == "view": inter = "edit"
    if not surface: return None, inter
    return surface, inter


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("root"); ap.add_argument("--out", default="./capability-report")
    a = ap.parse_args()
    root = os.path.abspath(a.root)
    if not os.path.isdir(root): sys.exit(f"not a directory: {root}")
    decls, nfiles = scan(root)
    # de-dup identical (id,family,file,line)
    seen, uniq = set(), []
    for d in decls:
        k = (d["id"], d["family"], d["file"], d["line"])
        if k in seen: continue
        seen.add(k); uniq.append(d)
    for d in uniq:
        d["proposed_surface"], d["proposed_interaction"] = propose(d)
    os.makedirs(a.out, exist_ok=True)
    json.dump({"root": root, "files_scanned": nfiles, "declarations": uniq}, open(os.path.join(a.out, "inventory.json"), "w"), indent=1)
    cols = ["id", "family", "owner", "file", "line", "domain", "verb", "mutating", "side_effects", "status", "proposed_surface", "proposed_interaction", "description"]
    with open(os.path.join(a.out, "inventory.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore"); w.writeheader(); w.writerows(uniq)

    real = [d for d in uniq if not d["id"].startswith(("surface:", "provides:"))]
    by_surface = defaultdict(list); unmapped = []
    for d in real:
        (by_surface[d["proposed_surface"]] if d["proposed_surface"] else unmapped).append(d)
    by_id = defaultdict(set)
    for d in real: by_id[d["id"]].add(d["family"])
    multi = {k: v for k, v in by_id.items() if len(v) > 1}
    by_owner = defaultdict(int)
    for d in real: by_owner[d["owner"]] += 1
    fam = defaultdict(int)
    for d in uniq: fam[d["family"]] += 1

    L = [f"# Capability alignment — {root}", "", f"Files scanned: {nfiles}. Declarations found: {len(uniq)} ({len(real)} capability ids, {len(uniq) - len(real)} surface/provides tags).", "",
         "## Declaration families", ""]
    L += [f"- `{k}`: {v}" for k, v in sorted(fam.items(), key=lambda x: -x[1])]
    L += ["", "## Coverage by proposed surface", "", "| surface | ids | owners |", "|---|---|---|"]
    for s in SURFACES:
        if s in by_surface:
            L.append(f"| {s} | {len({d['id'] for d in by_surface[s]})} | {', '.join(sorted({d['owner'] for d in by_surface[s]})[:6])} |")
    L += ["", f"## Unmapped ({len({d['id'] for d in unmapped})} ids): need a domain, verb, or an explicit surface", ""]
    for i in sorted({d['id'] for d in unmapped})[:150]: L.append(f"- `{i}`")
    L += ["", f"## Declared in more than one family ({len(multi)}): one authority each", ""]
    for k, v in sorted(multi.items())[:120]: L.append(f"- `{k}`: {', '.join(sorted(v))}")
    L += ["", "## Owners by declaration count", ""] + [f"- `{k}`: {v}" for k, v in sorted(by_owner.items(), key=lambda x: -x[1])[:40]]
    L += ["", "Proposals come from domain/verb heuristics. They are suggestions, not decisions. `gate: supported` means eligible for the interface; the server still checks identity, tenant scope, tool registration, provider availability and approval."]
    open(os.path.join(a.out, "alignment.md"), "w").write("\n".join(L) + "\n")
    print(f"scanned {nfiles} files -> {len(uniq)} declarations, {len(real)} capability ids, {len(unmapped)} unmapped, {len(multi)} multi-family")
    print(f"wrote {a.out}/inventory.json, inventory.csv, alignment.md")


if __name__ == "__main__":
    main()

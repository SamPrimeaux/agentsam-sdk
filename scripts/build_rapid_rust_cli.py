#!/usr/bin/env python3
"""Build/install/smoke-test AgentSam Rapid Rust native CLI.

Nothing here deploys a Worker. --bootstrap only installs local Rust/Wasm build
prerequisites. --smoke scaffolds disposable projects and cargo-checks them.
"""
from __future__ import annotations
import argparse, json, os, shutil, subprocess, sys, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "packages" / "agentsam-rapid-rust" / "Cargo.toml"
BINARY = ROOT / "packages" / "agentsam-rapid-rust" / "target" / "release" / "agentsam-rapid-rust"
WORKER_BUILD_VERSION = "0.8.7"
TEMPLATES = ("api", "shared-core", "crypto-auth", "data-processor")

def run(cmd, *, cwd=ROOT, check=True):
    print("→", " ".join(map(str, cmd)))
    return subprocess.run(list(map(str, cmd)), cwd=cwd, check=check)

def have(cmd):
    return shutil.which(cmd) is not None

def bootstrap():
    if not have("rustup") or not have("cargo"):
        raise RuntimeError("Rust/rustup/cargo are required")
    installed = subprocess.check_output(["rustup", "target", "list", "--installed"], text=True)
    if "wasm32-unknown-unknown" not in installed.splitlines():
        run(["rustup", "target", "add", "wasm32-unknown-unknown"])
    if not have("worker-build"):
        run(["cargo", "install", "worker-build", "--version", WORKER_BUILD_VERSION, "--locked"])

def build():
    run(["cargo", "fmt", "--manifest-path", MANIFEST, "--", "--check"])
    run(["cargo", "test", "--manifest-path", MANIFEST])
    run(["cargo", "build", "--release", "--manifest-path", MANIFEST])

def install(dest: Path):
    if not BINARY.exists():
        build()
    dest.mkdir(parents=True, exist_ok=True)
    target = dest / "agentsam-rapid-rust-native"
    tmp = dest / ".agentsam-rapid-rust-native.tmp"
    shutil.copy2(BINARY, tmp)
    tmp.chmod(0o755)
    os.replace(tmp, target)
    print("installed:", target)
    return target

def smoke(binary: Path):
    bootstrap()
    with tempfile.TemporaryDirectory(prefix="agentsam-rapid-rust-") as td:
        root = Path(td)
        for template in TEMPLATES:
            name = "fixture-" + template
            run([binary, "new", name, "--template", template, "--out", root])
            project = root / name
            run([binary, "check", "--cwd", project])

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--bootstrap", action="store_true")
    ap.add_argument("--build", action="store_true")
    ap.add_argument("--install", action="store_true")
    ap.add_argument("--install-dir", type=Path, default=Path.home()/".agentsam"/"bin")
    ap.add_argument("--smoke", action="store_true")
    ap.add_argument("--json", action="store_true")
    args=ap.parse_args()
    if not any((args.bootstrap,args.build,args.install,args.smoke)):
        args.build=True
    if args.bootstrap: bootstrap()
    if args.build or args.install or args.smoke: build()
    installed=None
    if args.install: installed=install(args.install_dir.expanduser())
    if args.smoke: smoke(installed or BINARY)
    result={"ok":True,"binary":str(BINARY),"installed":str(installed) if installed else None,"smoke":args.smoke}
    if args.json: print(json.dumps(result,indent=2))
    return 0

if __name__ == '__main__':
    try: raise SystemExit(main())
    except (RuntimeError, subprocess.CalledProcessError) as exc:
        print("ERROR:", exc, file=sys.stderr); raise SystemExit(2)

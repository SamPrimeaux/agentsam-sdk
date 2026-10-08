#!/usr/bin/env python3
"""Toolchain doctor that teaches what each prerequisite is and how to repair it."""

from __future__ import annotations
import argparse, json, platform, shutil, subprocess
from dataclasses import dataclass, asdict


@dataclass
class Probe:
    id: str
    title: str
    ok: bool
    version: str | None
    path: str | None
    what_it_is: str
    why_you_might_need_it: list[str]
    install: list[str]
    verify: list[str]
    next: list[str]


def version(name, args):
    path = shutil.which(name)
    if not path:
        return None, None
    try:
        cp = subprocess.run([path, *args], text=True, capture_output=True, timeout=10)
    except subprocess.TimeoutExpired:
        return path, None
    text = (cp.stdout or cp.stderr).strip().splitlines()
    return path, (text[0] if text else None)


def bin_probe(id, title, version_args, what, why, install, verify, next_):
    path, v = version(id, version_args)
    return Probe(id, title, bool(path and v), v, path, what, why, install, verify, next_)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--teach", action="store_true", help="Show descriptions even for tools already installed")
    args = ap.parse_args()

    rust_install = [
        "Recommended: install Rust through rustup from https://rustup.rs/",
        "Open a new terminal after installation so ~/.cargo/bin is on PATH."
    ]

    probes = [
        bin_probe(
            "rustc", "Rust compiler", ["--version"],
            "rustc compiles Rust source code.",
            ["Needed whenever AgentSam is building native Rust or Rust/WebAssembly code."],
            rust_install,
            ["rustc --version"],
            ["Run `agentsam doctor` again.", "For Cloudflare Rust work, also verify the Wasm target."]
        ),
        bin_probe(
            "cargo", "Cargo", ["--version"],
            "Cargo is Rust's package manager and build tool.",
            ["Installs Rust CLI crates.", "Builds/tests Rust projects.", "Installs tools such as worker-build."],
            rust_install,
            ["cargo --version"],
            ["Run `agentsam doctor` again."]
        ),
        bin_probe(
            "rustup", "Rust toolchain manager", ["--version"],
            "rustup installs/manages Rust compilers, toolchains, and compilation targets.",
            ["Needed to add targets such as wasm32-unknown-unknown."],
            rust_install,
            ["rustup --version"],
            ["Run `rustup target list --installed` to inspect installed targets."]
        ),
        bin_probe(
            "node", "Node.js", ["--version"],
            "Node.js runs the JavaScript/TypeScript tooling used throughout the AgentSam SDK.",
            ["Needed by npm tooling, many AgentSam packages, and Wrangler workflows."],
            [
                "Install a supported Node.js release from https://nodejs.org/",
                "Or use your existing version manager such as nvm, fnm, or Volta."
            ],
            ["node --version", "npm --version"],
            ["Run `agentsam doctor` again."]
        ),
        bin_probe(
            "npm", "npm", ["--version"],
            "npm installs JavaScript/TypeScript packages and runs package scripts.",
            ["Needed to install AgentSam npm packages and project-local developer tooling."],
            ["npm normally arrives with Node.js; repair/reinstall Node if npm is absent."],
            ["npm --version"],
            ["Run `agentsam doctor` again."]
        ),
        bin_probe(
            "wrangler", "Cloudflare Wrangler", ["--version"],
            "Wrangler is Cloudflare's Worker development/deployment CLI.",
            ["Runs local Worker development.", "Packages/deploys Workers.", "Manages many Cloudflare developer workflows."],
            [
                "Preferred project-local install: npm install --save-dev wrangler",
                "One-off command: npx wrangler --version",
                "Global option: npm install --global wrangler"
            ],
            ["wrangler --version", "npx wrangler --version"],
            ["For a Rapid Rust project, retry `agentsam-rapid-rust build` or `deploy --dry-run`."]
        ),
        bin_probe(
            "worker-build", "worker-build", ["--version"],
            "worker-build compiles workers-rs Rust projects into WebAssembly Worker bundles.",
            ["Needed when building Cloudflare Workers written with workers-rs."],
            ["Install with Cargo: cargo install worker-build"],
            ["worker-build --version"],
            ["Retry the Rapid Rust build after installation."]
        ),
    ]

    rustup = shutil.which("rustup")
    wasm_ok = False
    if rustup:
        cp = subprocess.run([rustup, "target", "list", "--installed"], text=True, capture_output=True)
        wasm_ok = "wasm32-unknown-unknown" in cp.stdout.split()
    probes.append(Probe(
        "wasm32-unknown-unknown",
        "Rust WebAssembly target",
        wasm_ok,
        "installed" if wasm_ok else None,
        None,
        "A Rust compilation target that produces generic WebAssembly instead of a macOS/Linux/Windows native executable.",
        [
            "Cloudflare Rust Workers execute WebAssembly.",
            "Rapid Rust uses it for portable Worker builds.",
            "It does not mean your entire machine is 32-bit; `wasm32` names the WebAssembly target architecture."
        ],
        ["rustup target add wasm32-unknown-unknown"],
        ["rustup target list --installed | grep wasm32-unknown-unknown"],
        ["Retry `agentsam-rapid-rust check` or `agentsam-rapid-rust build`."]
    ))

    required_ok = all(p.ok for p in probes if p.id != "wrangler")

    if args.json:
        print(json.dumps({"ok": required_ok, "probes": [asdict(p) for p in probes]}, indent=2))
        return 0 if required_ok else 1

    print("AgentSam toolchain guide\n")
    for p in probes:
        print(f"{'✓' if p.ok else '✗'} {p.title:28} {p.version or 'missing'}")
        if args.teach or not p.ok:
            print(f"    What it is: {p.what_it_is}")
            print("    Why it matters:")
            for x in p.why_you_might_need_it:
                print(f"      - {x}")
            if not p.ok:
                print("    Install / repair:")
                for x in p.install:
                    print(f"      {x}")
                print("    Verify:")
                for x in p.verify:
                    print(f"      {x}")
                print("    Continue:")
                for x in p.next:
                    print(f"      {x}")
            print()

    if required_ok:
        print("Ready: required Rust/Wasm tooling is available.")
        if not args.teach:
            print("Tip: rerun with --teach to learn what each tool does and when AgentSam uses it.")
    else:
        print("Not ready yet. Repair the missing items above, verify them, then rerun this guide.")
    return 0 if required_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

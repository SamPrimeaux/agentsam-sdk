#!/usr/bin/env python3
"""Install a pinned Node.js runtime into a prefix, verified against a pinned SHA-256.

Stdlib only. Used at image build time so the media toolchain does not depend on the
distro's Node (too old for current glTF tooling) or on a third-party apt repository.
Usage: install_node.py <version> <prefix>
"""
from __future__ import annotations

import hashlib
import platform
import posixpath
import sys
import tarfile
import tempfile
import urllib.request
from pathlib import Path

CHECKSUMS = {
    "v20.20.2": {
        "arm64": "73093db209e4e9e09dd7d15a47aeaab1b74833830df03efa5f942a1122c5fa71",
        "x64": "df770b2a6f130ed8627c9782c988fda9669fa23898329a61a871e32f965e007d",
    },
}
ARCH = {"aarch64": "arm64", "arm64": "arm64", "x86_64": "x64", "amd64": "x64"}


def link_is_safe(member) -> bool:
    """Node's official tarball ships bin/npm, bin/npx and bin/corepack as relative symlinks. Allow a symlink only
    when its target resolves inside the install prefix; hard links, devices and absolute or escaping links stay refused."""
    if not member.issym() or member.linkname.startswith("/"):
        return False
    resolved = posixpath.normpath(posixpath.join(posixpath.dirname(member.name), member.linkname))
    return resolved != ".." and not resolved.startswith("../")


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print(__doc__, file=sys.stderr)
        return 2
    version, prefix = argv[1], Path(argv[2])
    arch = ARCH.get(platform.machine().lower())
    expected = CHECKSUMS.get(version, {}).get(arch or "")
    if not expected:
        print(f"no pinned checksum for node {version} on {platform.machine()}", file=sys.stderr)
        return 1
    name = f"node-{version}-linux-{arch}.tar.xz"
    with tempfile.TemporaryDirectory() as tmp:
        archive = Path(tmp) / name
        urllib.request.urlretrieve(f"https://nodejs.org/dist/{version}/{name}", archive)
        digest = hashlib.sha256(archive.read_bytes()).hexdigest()
        if digest != expected:
            print(f"checksum mismatch for {name}: {digest}", file=sys.stderr)
            return 1
        prefix.mkdir(parents=True, exist_ok=True)
        # Python 3.11.2 (Debian 12) predates tarfile extraction filters, so refuse unsafe paths ourselves.
        with tarfile.open(archive, "r:xz") as tar:
            for member in tar.getmembers():
                member.name = member.name.split("/", 1)[1] if "/" in member.name else ""
                if not member.name:
                    continue
                if member.name.startswith("/") or ".." in Path(member.name).parts:
                    print(f"refusing unsafe path in archive: {member.name}", file=sys.stderr)
                    return 1
                if hasattr(tarfile, "data_filter"):
                    tar.extract(member, prefix, filter="data")
                else:
                    # Old Python lacks extraction filters: plain files, directories and contained symlinks only.
                    if not (member.isfile() or member.isdir() or link_is_safe(member)):
                        raise ValueError(f"unsafe archive member type: {member.name}")
                    tar.extract(member, prefix)
    print(f"node {version} installed at {prefix}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))

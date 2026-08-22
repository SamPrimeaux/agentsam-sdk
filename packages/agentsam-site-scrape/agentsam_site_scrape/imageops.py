"""Image dimensions + optimization via macOS sips (fail-loud when missing)."""

from __future__ import annotations

import shutil
import struct
import subprocess
from pathlib import Path

_SIPS_PATH = shutil.which("sips")


def sips_available() -> bool:
    return _SIPS_PATH is not None


def read_dimensions(path: Path) -> tuple[int, int] | None:
    """Return (width, height) from PNG/JPEG headers; None for unsupported formats."""
    try:
        data = path.read_bytes()
    except OSError:
        return None

    if data[:8] == b"\x89PNG\r\n\x1a\n":
        if len(data) >= 24 and data[12:16] == b"IHDR":
            width, height = struct.unpack(">II", data[16:24])
            return width, height
        return None

    if data[:2] == b"\xff\xd8":  # JPEG SOI
        i = 2
        while i + 4 <= len(data):
            if data[i] != 0xFF:
                i += 1
                continue
            marker = data[i + 1]
            if marker in (0xD8, 0x01) or 0xD0 <= marker <= 0xD7:
                i += 2
                continue
            if i + 4 > len(data):
                break
            segment_len = struct.unpack(">H", data[i + 2:i + 4])[0]
            if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
                if i + 9 <= len(data):
                    height, width = struct.unpack(">HH", data[i + 5:i + 9])
                    return width, height
                return None
            i += 2 + segment_len
        return None

    # WebP VP8 / VP8L / VP8X (optional — avoids unknown aspect on Wix CDNs)
    if data[:4] == b"RIFF" and len(data) >= 30 and data[8:12] == b"WEBP":
        chunk = data[12:16]
        if chunk == b"VP8 " and len(data) >= 30:
            width = struct.unpack("<H", data[26:28])[0] & 0x3FFF
            height = struct.unpack("<H", data[28:30])[0] & 0x3FFF
            return width, height
        if chunk == b"VP8L" and len(data) >= 25:
            bits = struct.unpack("<I", data[21:25])[0]
            width = (bits & 0x3FFF) + 1
            height = ((bits >> 14) & 0x3FFF) + 1
            return width, height
        if chunk == b"VP8X" and len(data) >= 30:
            width = 1 + int.from_bytes(data[24:27], "little")
            height = 1 + int.from_bytes(data[27:30], "little")
            return width, height

    return None


def sniff_image_ext(data: bytes) -> str | None:
    """Return a file extension from magic bytes, or None if not a known image."""
    if len(data) < 12:
        return None
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return ".png"
    if data[:2] == b"\xff\xd8":
        return ".jpg"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return ".gif"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return ".webp"
    return None


def optimize_image(
    src: Path,
    dst: Path,
    max_long_edge: int,
    jpeg_quality: int,
    *,
    allow_unoptimized: bool = False,
) -> str:
    """Resize/recompress with sips. Fail loud if sips missing unless allowed."""
    dst.parent.mkdir(parents=True, exist_ok=True)

    if _SIPS_PATH is None:
        if not allow_unoptimized:
            raise RuntimeError(
                "sips not found — image optimization requires macOS sips. "
                "Pass --no-optimize or --allow-unoptimized to continue with copies."
            )
        shutil.copyfile(src, dst)
        return "copied:no-sips"

    suffix = src.suffix.lower()
    if suffix not in (".jpg", ".jpeg", ".png"):
        shutil.copyfile(src, dst)
        return "copied:unsupported-format"

    shutil.copyfile(src, dst)
    cmd = [_SIPS_PATH, "-Z", str(max_long_edge)]
    if suffix in (".jpg", ".jpeg"):
        cmd += ["-s", "formatOptions", str(jpeg_quality)]
    cmd += [str(dst)]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    if result.returncode != 0:
        if not allow_unoptimized:
            raise RuntimeError(f"sips failed: {result.stderr.strip()[:200]}")
        return f"copied:sips-failed:{result.stderr.strip()[:200]}"
    return "optimized"

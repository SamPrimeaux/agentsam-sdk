#!/usr/bin/env python3
"""Build-time only: produce terminal-art grids from the canonical Geaux PNG without Pillow."""
from __future__ import annotations
import json
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/brand/inneranimal-companions/v1/geaux/avatars/geaux-avatar-128.png"
TARGETS = [
    ROOT / "python/agentsam_sdk/assets/geaux_boot.json",
    ROOT / "src/ui/art/geaux_boot.json",
]

def png_rgba(path: Path):
    raw = path.read_bytes()
    if raw[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("expected PNG")
    pos, compressed, dimensions = 8, bytearray(), None
    while pos < len(raw):
        length = struct.unpack_from(">I", raw, pos)[0]
        tag = raw[pos + 4:pos + 8]
        body = raw[pos + 8:pos + 8 + length]
        pos += length + 12
        if tag == b"IHDR":
            width, height, depth, color, *_ = struct.unpack(">IIBBBBB", body)
            if depth != 8 or color != 6:
                raise ValueError("expected 8-bit RGBA PNG")
            dimensions = (width, height)
        elif tag == b"IDAT":
            compressed.extend(body)
        elif tag == b"IEND":
            break
    if dimensions is None:
        raise ValueError("no PNG image header")
    width, height = dimensions
    decoded = zlib.decompress(compressed)
    rows, offset, previous = [], 0, bytearray(width * 4)
    for _ in range(height):
        mode = decoded[offset]
        offset += 1
        scan = bytearray(decoded[offset:offset + width * 4])
        offset += width * 4
        for i in range(len(scan)):
            left = scan[i - 4] if i >= 4 else 0
            up = previous[i]
            upper_left = previous[i - 4] if i >= 4 else 0
            if mode == 1:
                scan[i] = (scan[i] + left) & 255
            elif mode == 2:
                scan[i] = (scan[i] + up) & 255
            elif mode == 3:
                scan[i] = (scan[i] + (left + up) // 2) & 255
            elif mode == 4:
                p = left + up - upper_left
                pa, pb, pc = abs(p - left), abs(p - up), abs(p - upper_left)
                scan[i] = (scan[i] + (left if pa <= pb and pa <= pc else up if pb <= pc else upper_left)) & 255
            elif mode != 0:
                raise ValueError("unsupported PNG scanline filter")
        rows.append(scan)
        previous = scan
    return width, height, rows

def build():
    width, height, pixels = png_rgba(SOURCE)
    out_width, out_height = 24, 16
    grid = []
    for y in range(out_height):
        chars = []
        y0, y1 = y * height // out_height, (y + 1) * height // out_height
        for x in range(out_width):
            x0, x1 = x * width // out_width, (x + 1) * width // out_width
            values = []
            total = max(1, (y1-y0)*(x1-x0))
            for sy in range(y0, y1):
                for sx in range(x0, x1):
                    r,g,b,a = pixels[sy][sx*4:sx*4+4]
                    if a >= 64:
                        values.append((r*299 + g*587 + b*114)//1000)
            if len(values) < total * 0.3:
                chars.append(".")
            else:
                brightness = sum(values) // len(values)
                chars.append("h" if brightness >= 176 else "m" if brightness >= 89 else "d")
        grid.append("".join(chars))
    if sum(ch != "." for line in grid for ch in line) < 60:
        raise ValueError("Geaux source lacks sufficient visible artwork")
    output = {"schema": "agentsam.ansi-art.v1", "companionId": "geaux", "source": "geaux/avatars/geaux-avatar-128.png", "width": out_width, "height": out_height, "grid": grid}
    for target in TARGETS:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(output, indent=2) + "\n")
        print("wrote", target.relative_to(ROOT))
    print("nontransparent cells:", sum(ch != "." for line in grid for ch in line))

if __name__ == "__main__":
    build()

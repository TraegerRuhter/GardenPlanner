#!/usr/bin/env python3
"""Generate the PWA icon set (§22) from a 16x16 pixel-art sprout.

Stdlib only: PNGs are assembled chunk-by-chunk (IHDR/IDAT/IEND + zlib), the
favicon is the same pixel map emitted as SVG rects. Nearest-neighbor scaling
keeps the pixel-art edges crisp. Outputs into public/:

  favicon.svg, icon-192.png, icon-512.png,
  icon-maskable-512.png (safe-zone padded), apple-touch-icon.png (180)

Run from garden-planner/:  python3 scripts/make_icons.py
"""

import struct
import zlib
from pathlib import Path

PUBLIC = Path(__file__).resolve().parent.parent / "public"

# 16x16 sprout: two cotyledon leaves on a stem over a soil mound.
PIXELS = [
    "................",
    "................",
    "................",
    "...LL......LL...",
    "..LLLL....LLLL..",
    "..LLLLL..LLLLL..",
    "...LLLLssLLLL...",
    ".....LLssLL.....",
    ".......ss.......",
    ".......ss.......",
    ".......ss.......",
    ".......ss.......",
    "....mmmmmmmm....",
    "..mmMMMMMMMMmm..",
    ".mMMMMMMMMMMMMm.",
    "................",
]

PALETTE = {
    "L": (88, 168, 84, 255),  # leaf  #58a854
    "s": (58, 125, 68, 255),  # stem  #3a7d44
    "m": (125, 92, 70, 255),  # soil light #7d5c46
    "M": (92, 64, 51, 255),  # soil dark  #5c4033
    ".": (0, 0, 0, 0),  # transparent
}

PAPER = (247, 243, 232, 255)  # --color-paper #f7f3e8


def png_bytes(size: int, art_scale: int, background=None) -> bytes:
    """Render the sprout at art_scale (16*art_scale px), centered on a
    size x size canvas; background None = transparent."""
    bg = background or (0, 0, 0, 0)
    canvas = [[bg] * size for _ in range(size)]
    art_px = 16 * art_scale
    off = (size - art_px) // 2
    for row, line in enumerate(PIXELS):
        for col, ch in enumerate(line):
            color = PALETTE[ch]
            if color[3] == 0:
                continue
            for dy in range(art_scale):
                for dx in range(art_scale):
                    canvas[off + row * art_scale + dy][off + col * art_scale + dx] = color

    raw = b"".join(
        b"\x00" + b"".join(struct.pack("4B", *px) for px in line) for line in canvas
    )

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def svg() -> str:
    rects = []
    for row, line in enumerate(PIXELS):
        for col, ch in enumerate(line):
            r, g, b, a = PALETTE[ch]
            if a == 0:
                continue
            rects.append(f'<rect x="{col}" y="{row}" width="1" height="1" fill="#{r:02x}{g:02x}{b:02x}"/>')
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" '
        'shape-rendering="crispEdges">' + "".join(rects) + "</svg>\n"
    )


def main() -> None:
    PUBLIC.mkdir(exist_ok=True)
    out = {
        "icon-192.png": png_bytes(192, 12),
        "icon-512.png": png_bytes(512, 32),
        # maskable: art at ~59% so it sits inside the central safe zone
        "icon-maskable-512.png": png_bytes(512, 19, background=PAPER),
        "apple-touch-icon.png": png_bytes(180, 11, background=PAPER),
    }
    for name, data in out.items():
        (PUBLIC / name).write_bytes(data)
        print(f"wrote public/{name} ({len(data)} bytes)")
    (PUBLIC / "favicon.svg").write_text(svg())
    print("wrote public/favicon.svg")


if __name__ == "__main__":
    main()

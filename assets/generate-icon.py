#!/usr/bin/env python3
"""Generate the EvenFoundryVTT app icon (Even Hub-compatible: greyscale, foreground + background).

Even Hub store requirement (hub.evenrealities.com/docs/reference/app-submission):
  - "Icon and background image are monochrome / greyscale only. Color assets are rejected."
  - "Both foreground and background are supplied (neither null nor empty)."
  - "Icon is legible — no black scribble or noisy patterns."

Design: a stylised d20 (the D&D die) — a recognisable silhouette that reads at small sizes and
renders cleanly on the G2's 4-bit green phosphor display. The SAME icon is reused as the project
/ docker-compose logo.

Outputs (512x512 PNG, greyscale 'L'):
  icon-foreground.png  — the d20 symbol on transparent (RGBA, greyscale channels)
  icon-background.png  — a flat vertical greyscale gradient
  icon.png             — foreground composited over background (the all-in-one icon)

Run: python3 assets/generate-icon.py
"""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

SIZE = 512
CX = CY = SIZE / 2
OUT = Path(__file__).parent / "icon"


def _hexagon(cx: float, cy: float, r: float, rot: float = -math.pi / 2) -> list[tuple[float, float]]:
    """6 vertices of a pointy-top hexagon."""
    return [(cx + r * math.cos(rot + i * math.pi / 3), cy + r * math.sin(rot + i * math.pi / 3)) for i in range(6)]


def _triangle(cx: float, cy: float, r: float, rot: float) -> list[tuple[float, float]]:
    return [(cx + r * math.cos(rot + i * 2 * math.pi / 3), cy + r * math.sin(rot + i * 2 * math.pi / 3)) for i in range(3)]


def _font(px: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for name in ("DejaVuSans-Bold.ttf", "DejaVuSans.ttf", "Arial Bold.ttf"):
        try:
            return ImageFont.truetype(name, px)
        except OSError:
            continue
    return ImageFont.load_default(size=px)


def build_foreground() -> Image.Image:
    """The d20 die, light greyscale with darker facet lines, on transparent."""
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    R = SIZE * 0.40  # outer hexagon radius
    inner = R * 0.52  # central (top) face radius
    fill = (232, 232, 232, 255)  # near-white die body
    edge = (40, 40, 40, 255)  # dark facet lines
    mid = (150, 150, 150, 255)  # mid-grey side facets

    hexv = _hexagon(CX, CY, R)
    tri = _triangle(CX, CY, inner, -math.pi / 2)  # central upward triangle = top face

    # Die body
    d.polygon(hexv, fill=fill, outline=edge, width=6)

    # Side facets (each hex edge → nearest central-triangle vertex) shaded mid-grey for depth
    for i in range(6):
        a = hexv[i]
        b = hexv[(i + 1) % 6]
        t = tri[i // 2]
        d.polygon([a, b, t], fill=mid if i % 2 else fill, outline=edge, width=4)

    # Central top face
    d.polygon(tri, fill=fill, outline=edge, width=6)
    # Spokes from centre to hex vertices (classic d20 facet lines)
    for v in hexv:
        d.line([(CX, CY), v], fill=edge, width=4)
    for v in tri:
        d.line([(CX, CY), v], fill=edge, width=4)

    # "20" on the top face
    f = _font(int(SIZE * 0.20))
    tb = d.textbbox((0, 0), "20", font=f)
    d.text((CX - (tb[2] - tb[0]) / 2, CY - (tb[3] - tb[1]) / 2 - tb[1] - SIZE * 0.04), "20", font=f, fill=edge)

    return img


def build_background() -> Image.Image:
    """Flat vertical greyscale gradient (dark top → mid bottom)."""
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 255))
    px = img.load()
    top, bot = 18, 58
    for y in range(SIZE):
        v = int(top + (bot - top) * (y / SIZE))
        for x in range(SIZE):
            px[x, y] = (v, v, v, 255)
    return img


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    fg = build_foreground()
    bg = build_background()
    icon = Image.alpha_composite(bg, fg)

    fg.save(OUT / "icon-foreground.png")
    bg.save(OUT / "icon-background.png")
    icon.convert("RGB").save(OUT / "icon.png")
    # 4-bit-friendly preview (what the G2 phosphor sees): greyscale 'L'
    icon.convert("L").save(OUT / "icon-greyscale.png")
    print("wrote:", *(p.name for p in sorted(OUT.glob("*.png"))))


if __name__ == "__main__":
    main()

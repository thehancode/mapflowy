#!/usr/bin/env python3
"""Trace icon.png and generate transparent SVG/PNG/ICO web assets.

Dependencies: pip install Pillow numpy potracer cairosvg
Run: python3 scripts/vectorize_icon.py
"""
from io import BytesIO
from pathlib import Path
from statistics import median
import xml.etree.ElementTree as ET

import cairosvg
import numpy as np
from PIL import Image
import potrace

ROOT = Path(__file__).resolve().parents[1]
NS = "http://www.w3.org/2000/svg"
ET.register_namespace("", NS)


def main():
    pixels = np.asarray(Image.open(ROOT / "icon.png").convert("RGB"), dtype=int)
    separation = pixels[:, :, 2] - pixels[:, :, 0]
    threshold = median(separation[separation > 65].tolist()) / 2
    foreground = separation > threshold
    curves = potrace.Bitmap(~foreground).trace(turdsize=8, alphamax=1, opttolerance=0.15)
    y, x = np.where(foreground)
    left, top = int(x.min()) - 20, int(y.min()) - 20
    width, height = int(x.max() - x.min()) + 41, int(y.max() - y.min()) + 41
    svg = ET.Element(f"{{{NS}}}svg", {
        "viewBox": f"{left} {top} {width} {height}", "fill": "#88AFE0",
    })
    ET.SubElement(svg, f"{{{NS}}}title").text = "Mapflowy"
    point = lambda p: f"{p.x:.3f} {p.y:.3f}"
    commands = []
    for curve in curves:
        commands.append("M " + point(curve.start_point))
        for segment in curve:
            if segment.is_corner:
                commands.append(f"L {point(segment.c)} {point(segment.end_point)}")
            else:
                commands.append(f"C {point(segment.c1)} {point(segment.c2)} {point(segment.end_point)}")
        commands.append("Z")
    ET.SubElement(svg, f"{{{NS}}}path", {"d": " ".join(commands), "fill-rule": "evenodd"})
    ET.indent(svg, space="  ")
    content = ET.tostring(svg, encoding="unicode") + "\n"
    (ROOT / "icon.svg").write_text(content)
    (ROOT / "public" / "icon.svg").write_text(content)

    # Square favicon canvas, centered around the traced mark with a small margin.
    side = max(width, height)
    svg.set("viewBox", f"{left - (side - width) / 2} {top - (side - height) / 2} {side} {side}")
    favicon = ET.tostring(svg, encoding="unicode") + "\n"
    (ROOT / "public" / "favicon.svg").write_text(favicon)
    raster = Image.open(BytesIO(cairosvg.svg2png(
        bytestring=favicon.encode(), output_width=256, output_height=256,
    ))).convert("RGBA")
    raster.save(ROOT / "public" / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
    raster.resize((32, 32), Image.Resampling.LANCZOS).save(ROOT / "public" / "favicon-32.png")
    print(f"Traced {len(curves)} contours; wrote icon.svg and public icon/favicon assets.")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Trace all blue components in logo.png into smooth SVG paths.

Dependencies: Pillow, numpy, potracer (pip install Pillow numpy potracer).
Run: python3 scripts/vectorize_logo.py
Paper texture becomes white; blue texture becomes its median color.
"""

from pathlib import Path
from statistics import median
import xml.etree.ElementTree as ET

from PIL import Image
import numpy as np
import potrace

ROOT = Path(__file__).resolve().parents[1]
SVG = "http://www.w3.org/2000/svg"


def main():
    with Image.open(ROOT / "logo.png") as image:
        image = image.convert("RGB")
        width, height = image.size
        pixels = list(image.get_flattened_data() if hasattr(image, "get_flattened_data")
                      else image.getdata())
    interior = [(r, g, b) for r, g, b in pixels if b - r > 65]
    if not interior:
        raise ValueError("No blue logo found in the input image")
    color = tuple(round(median(c[i] for c in interior)) for i in range(3))
    # Half the foreground/background separation locates antialiased edges.
    threshold = (color[2] - color[0]) / 2
    # Bitmap treats black (False) as foreground.
    mask = np.array([b - r <= threshold for r, g, b in pixels]).reshape(height, width)
    curves = potrace.Bitmap(mask).trace(turdsize=8, alphamax=1.0, opttolerance=0.15)
    ET.register_namespace("", SVG)
    result = ET.Element(f"{{{SVG}}}svg", {
        "viewBox": f"0 0 {width} {height}", "width": str(width),
        "height": str(height), "role": "img", "aria-labelledby": "logo-title",
    })
    ET.SubElement(result, f"{{{SVG}}}title", {"id": "logo-title"}).text = "Logo"
    ET.SubElement(result, f"{{{SVG}}}rect", {
        "width": str(width), "height": str(height), "fill": "#ffffff",
    })
    if not curves:
        raise ValueError("Tracing produced no paths")
    def point(p):
        return f"{p.x:.3f} {p.y:.3f}"

    for curve in curves:
        commands = ["M " + point(curve.start_point)]
        for segment in curve:
            if segment.is_corner:
                commands.append(f"L {point(segment.c)} {point(segment.end_point)}")
            else:
                commands.append(f"C {point(segment.c1)} {point(segment.c2)} {point(segment.end_point)}")
        commands.append("Z")
        ET.SubElement(result, f"{{{SVG}}}path", {
            "d": " ".join(commands),
            "fill": "#" + "".join(f"{c:02x}" for c in color),
        })
    ET.indent(result, space="  ")
    (ROOT / "logo.svg").write_text(ET.tostring(result, encoding="unicode") + "\n")
    print(f"Wrote logo.svg: {len(curves)} curved paths, color {color}")


if __name__ == "__main__":
    main()

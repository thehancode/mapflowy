#!/usr/bin/env python3
"""Create transparent, tightly cropped logo variants from the traced logo.svg."""
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
NS = "http://www.w3.org/2000/svg"
ET.register_namespace("", NS)
paths = ET.parse(ROOT / "logo.svg").getroot().findall(f"{{{NS}}}path")
for variant, border in (("light", "#000000"), ("dark", "#ffffff"), ("outline", None), ("filled", None)):
    svg = ET.Element(f"{{{NS}}}svg", {
        "viewBox": "40 380 1200 510", "fill": "none",
        "stroke-linejoin": "round", "stroke-linecap": "round",
    })
    ET.SubElement(svg, f"{{{NS}}}title").text = "Mapflowy"
    # Outline variants paint the border first, followed by the blue contour.
    strokes = [(border, "32")] if border else []
    if variant == "filled":
        for path in paths:
            ET.SubElement(svg, f"{{{NS}}}path", {
                "d": path.attrib["d"], "fill": "#88AFE0",
            })
    else:
        strokes.append(("#88AFE0", "18"))
    for stroke, width in strokes:
        for path in paths:
            ET.SubElement(svg, f"{{{NS}}}path", {
                "d": path.attrib["d"], "stroke": stroke, "stroke-width": width,
            })
    ET.indent(svg, space="  ")
    (ROOT / "public" / f"logo-{variant}.svg").write_text(
        ET.tostring(svg, encoding="unicode") + "\n"
    )

import { describe, expect, it } from "vitest";
import { circleLayout, graphNodeLabelLines, polygonArea, polygonBottomBand, radialArcPath, viewportEdgeOverlayPath, viewportEdges, voronoiPolygons } from "./geometry";

describe("organizer geometry", () => {
  it("places a single item at the center", () => {
    expect(circleLayout(1)).toEqual([{ x: .5, y: .5 }]);
  });

  it("keeps words together on the first graph-label line and truncates the second", () => {
    expect(graphNodeLabelLines("x".repeat(20))).toEqual(["x".repeat(20)]);
    expect(graphNodeLabelLines(`${"x".repeat(20)} ${"y".repeat(19)}`)).toEqual(["x".repeat(20), "y".repeat(19)]);
    expect(graphNodeLabelLines(`A ${"x".repeat(18)} word next`)).toEqual([`A ${"x".repeat(18)}`, "word next"]);
    expect(graphNodeLabelLines(`${"x".repeat(20)} ${"y".repeat(21)}`)).toEqual(["x".repeat(20), `${"y".repeat(17)}...`]);
  });

  it("draws the long Graph-view arc while leaving the bottom quarter open", () => {
    expect(radialArcPath(10, 225, -45, true)).toBe("M -7.0711 7.0711 A 10 10 0 1 1 7.0711 7.0711");
  });

  it("partitions the complete stage area", () => {
    const sites = circleLayout(4).map((point, index) => ({ id: String(index), x: point.x * 800, y: point.y * 600 }));
    const area = voronoiPolygons(sites, 800, 600).reduce((sum, polygon) => sum + polygonArea(polygon), 0);
    expect(area).toBeCloseTo(800 * 600, 4);
  });

  it("detects each viewport edge touched by a polygon", () => {
    expect(viewportEdges([{ x: 0, y: 0 }, { x: 45, y: 0 }, { x: 45, y: 60 }, { x: 0, y: 60 }], 100, 100)).toEqual(["top", "left"]);
    expect(viewportEdges([{ x: 20, y: 20 }, { x: 80, y: 20 }, { x: 80, y: 80 }, { x: 20, y: 80 }], 100, 100)).toEqual([]);
    expect(viewportEdges([{ x: 50, y: 0 }, { x: 80, y: 30 }, { x: 20, y: 30 }], 100, 100)).toEqual([]);
  });

  it("rounds only inner elbows shared by adjacent add-child edges", () => {
    const polygon = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 200 }, { x: 0, y: 200 }];
    const curves = (path: string) => path.match(/ Q /g)?.length ?? 0;
    expect(curves(viewportEdgeOverlayPath(polygon, ["top"], 200, 200, 40, 12))).toBe(4);
    for (const edges of [["top", "left"], ["top", "right"], ["bottom", "right"], ["bottom", "left"]] as const) {
      expect(curves(viewportEdgeOverlayPath(polygon, edges, 200, 200, 40, 12))).toBe(5);
    }
    expect(curves(viewportEdgeOverlayPath(polygon, ["top", "right", "bottom", "left"], 200, 200, 40, 12))).toBe(8);
  });

  it("clips a horizontal add-child band to the bottom of a polygon", () => {
    const band = polygonBottomBand([{ x: 20, y: 10 }, { x: 180, y: 10 }, { x: 140, y: 150 }, { x: 60, y: 150 }], 40);
    expect(Math.min(...band.map(({ y }) => y))).toBeCloseTo(110);
    expect(Math.max(...band.map(({ y }) => y))).toBeCloseTo(150);
    expect(band.every(({ x, y }) => x >= 20 && x <= 180 && y >= 110)).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { circleLayout, polygonArea, viewportEdges, voronoiPolygons } from "./geometry";

describe("organizer geometry", () => {
  it("places a single item at the center", () => {
    expect(circleLayout(1)).toEqual([{ x: .5, y: .5 }]);
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
});

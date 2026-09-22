import { describe, expect, it } from "vitest";
import type { LayoutEntry } from "../../lib/organizer";
import { LayoutController } from "./layout-controller";

const entry = (x: number, y: number, depth: number, index: number): LayoutEntry => ({
  x, y, depth, index, angle: 0, radius: depth, parent: null, path: [],
  node: { id: `${depth}-${index}`, name: "Node", children: [] },
});

describe("balloon presentation", () => {
  const controller = new LayoutController("balloon", () => {});
  it("renders a straight connector between the exact node centers", () => {
    const path = controller.linkPath(entry(10, 20, 0, 0), entry(110, 70, 1, 1));
    expect(path).toBe("M 10 20 L 110 70");
  });
  it("chooses stable shades from eight interpolated colors per repeating level pair", () => {
    const at = (depth: number, id: string) => controller.nodeFill({ ...entry(0, 0, depth, 0), node: { id, name: id, children: [] } });
    const ids = Array.from({ length: 80 }, (_, index) => `node-${index}`);
    const palettes = [
      ["#f38b70", "#df9eb6"],
      ["#e5a665", "#efc65d"],
      ["#88afe0", "#b99bdf"],
      ["#c5d36c", "#71c1b2"],
      ["#71c1b2", "#88afe0"],
    ];
    palettes.forEach((palette, depth) => {
      const fills = ids.map(id => at(depth + 5, id));
      expect(new Set(fills).size).toBe(8);
      expect(fills).toContain(palette[0]);
      expect(fills).toContain(palette[1]);
      expect(ids.map(id => at(depth + 10, id))).toEqual(fills);
      if (depth > 0) expect(ids.map(id => at(depth, id))).toEqual(fills);
    });
    expect(ids.every(id => at(0, id) === "#f38b70")).toBe(true);
    // The blue/lavender midpoint matches the independently inspected color demo.
    expect(ids.map(id => at(2, id))).toContain("#9095df");
  });
});

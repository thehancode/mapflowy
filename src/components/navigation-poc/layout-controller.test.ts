import { describe, expect, it } from "vitest";
import type { LayoutEntry } from "../../lib/organizer";
import { LayoutController } from "./layout-controller";

const entry = (x: number, y: number, depth: number, index: number): LayoutEntry => ({
  x, y, depth, index, angle: 0, radius: depth, parent: null, path: [],
  node: { id: `${depth}-${index}`, name: "Node", children: [] },
});

describe("balloon presentation", () => {
  const controller = new LayoutController("balloon", () => {});
  it("renders a cubic connector between the exact node centers", () => {
    const path = controller.linkPath(entry(10, 20, 0, 0), entry(110, 70, 1, 1));
    expect(path).toMatch(/^M 10 20 C /);
    expect(path).toMatch(/, 110 70$/);
    expect(path).not.toContain(" L ");
  });
  it("chooses stable shades from eight interpolated colors per repeating level pair", () => {
    const at = (depth: number, id: string) => controller.nodeFill({ ...entry(0, 0, depth, 0), node: { id, name: id, children: [] } });
    const hue = (fill: string) => Number(/^hsl\((\d+)/.exec(fill)![1]);
    const ids = Array.from({ length: 80 }, (_, index) => `node-${index}`);
    const palettes = [
      [216, 195, 174, 153, 132, 111, 78, 45],
      [12, 357, 342, 327, 312, 297, 282, 267],
      [174, 197, 220, 243, 266, 289, 312, 335],
      [78, 60, 42, 24, 6, 348, 330, 312],
    ];
    palettes.forEach((palette, depth) => {
      const fills = ids.map(id => at(depth, id));
      expect(new Set(fills).size).toBe(8);
      expect(fills.every(fill => fill.endsWith(" 58% 62%)"))).toBe(true);
      expect(fills.every(fill => palette.includes(hue(fill)))).toBe(true);
      expect(at(depth, "stable-node")).toBe(at(depth, "stable-node"));
    });
    expect(at(4, "stable-node")).toBe(at(0, "stable-node"));
  });
});

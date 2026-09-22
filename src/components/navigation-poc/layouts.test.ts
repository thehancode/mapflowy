import { describe, expect, it } from "vitest";
import type { OrganizerNode } from "../../lib/organizer";
import { demoSession } from "./demo";
import { computeLayout, edgesCross, footprintsFor, isValid, layoutOptions, segmentsIntersect, type Drawing } from "./layouts";
import { sceneFromDrawing } from "./layout-session";

const leaf = (id: string, name = id): OrganizerNode => ({ id, name, children: [] });
const chain = (length: number): OrganizerNode => ({ id: `chain-${length}`, name: "Long chain", children: length > 1 ? [chain(length - 1)] : [] });
const cases = [leaf("single"), chain(12), { id: "wide", name: "Wide", children: Array.from({ length: 18 }, (_, i) => leaf(`s-${i}`)) }, demoSession().workspace.maps[0],
  { id: "uneven", name: "Long label with multiple displayed lines", children: [chain(6), leaf("short"), { id: "branch", name: "Another really long label", children: Array.from({ length: 6 }, (_, i) => leaf(`long-${i}`, "A very long label that should have room")) }] }];

describe("spacing prototypes", () => {
  for (const option of layoutOptions) it(`${option.kind} is deterministic, finite, and preserves the tree`, () => {
    for (const root of cases) {
      const request = { root, kind: option.kind, footprints: footprintsFor(root) };
      const result = computeLayout(request);
      expect(result).toEqual(computeLayout(request));
      expect(result.nodes.length).toBe(Object.keys(request.footprints).length);
      expect(result.edges.length).toBe(result.nodes.length - 1);
      expect(result.nodes.every(n => Number.isFinite(n.x) && Number.isFinite(n.y))).toBe(true);
      if (option.kind !== "spring") expect(isValid(result), `${option.kind}: ${root.id}`).toBe(true);
      const scene = sceneFromDrawing(root, result, 390, 640);
      expect(scene.width).toBeGreaterThanOrEqual(390);
      expect(scene.height).toBeGreaterThanOrEqual(640);
      for (const node of scene.layout.nodes) {
        const box = request.footprints[node.node.id];
        expect(node.x + box.left).toBeGreaterThanOrEqual(48 - 1e-6);
        expect(node.y + box.top).toBeGreaterThanOrEqual(48 - 1e-6);
        expect(node.x + box.right).toBeLessThanOrEqual(scene.width - 48 + 1e-6);
        expect(node.y + box.bottom).toBeLessThanOrEqual(scene.height - 48 + 1e-6);
      }
    }
  });

  it("provides distinct demo layouts without silently falling back", () => {
    const root = demoSession().workspace.maps[0], footprints = footprintsFor(root);
    const results = layoutOptions.map(o => computeLayout({ root, footprints, kind: o.kind }));
    expect(results.map(r => r.fallback)).toEqual([false, false, false, false, false]);
    expect(new Set(results.map(r => JSON.stringify(r.nodes.map(n => [n.x, n.y])))).size).toBe(5);
  });

  it("keeps guaranteed layouts valid after additions and deletions", () => {
    const root = demoSession().workspace.maps[0];
    for (let edit = 0; edit < 3; edit++) {
      root.children[edit].children.push({ id: `added-${edit}`, name: "New branch", children: [leaf(`added-leaf-${edit}`)] });
      if (edit) root.children[0].children.shift();
      for (const kind of ["tidy", "mindmap", "balloon", "planar-spring"] as const) expect(isValid(computeLayout({ root, kind, footprints: footprintsFor(root) }))).toBe(true);
    }
  });

  it("detects crossings, overlapping segments and edges through unrelated labels", () => {
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 })).toBe(true);
    const box = { left: -5, right: 5, top: -5, bottom: 5 };
    const drawing: Drawing = { nodes: [{ id: "a", x: 0, y: 0, box }, { id: "b", x: 100, y: 0, box }, { id: "c", x: 50, y: 0, box }], edges: [[0, 1], [0, 2]] };
    expect(edgesCross(drawing, [0, 1], [0, 2])).toBe(true);
    drawing.edges = [[0, 1]];
    expect(isValid(drawing)).toBe(false);
    drawing.nodes[2].y = 40;
    expect(isValid(drawing)).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { duplicateMap, ELEMENT_TEXT_LIMIT, flattenTree, importGuestAsBranch, normalizeNode, radialTreeLayout, directionalConnectedCandidates, voronoiPathForSelection } from "./index";
import type { OrganizerNode } from "./types";

const tree = (): OrganizerNode => ({
  id: "root", name: "Projects", children: [
    { id: "a", name: "A", children: [{ id: "a1", name: "A1", children: [] }] },
    { id: "b", name: "B", children: [] },
  ],
});

describe("organizer tree", () => {
  it("normalizes names and replaces duplicate IDs", () => {
    const normalized = normalizeNode({ id: "same", name: "  Projects ", children: [{ id: "same", name: "", children: [] }] });
    expect(normalized.name).toBe("Projects");
    expect(normalized.children[0].name).toBe("Untitled");
    expect(normalized.children[0].id).not.toBe(normalized.id);
  });

  it("limits each element's stored text to 4096 characters", () => {
    const normalized = normalizeNode({ id: "long", name: "x".repeat(ELEMENT_TEXT_LIMIT + 100), children: [] });
    expect(normalized.name).toHaveLength(ELEMENT_TEXT_LIMIT);
  });

  it("imports guest data as a fresh, non-colliding branch", () => {
    const account = tree();
    const branch = importGuestAsBranch(account, tree());
    expect(branch.name).toBe("Imported guest workspace");
    expect(account.children.at(-1)).toBe(branch);
    const ids = flattenTree(account).map(({ node }) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("duplicates a complete tree with fresh IDs", () => {
    const original = tree();
    const duplicate = duplicateMap(original, [original]);
    expect(duplicate.name).toBe("Projects copy");
    expect(duplicate.children.map(({ name }) => name)).toEqual(["A", "B"]);
    const originalIds = new Set(flattenTree(original).map(({ node }) => node.id));
    expect(flattenTree(duplicate).every(({ node }) => !originalIds.has(node.id))).toBe(true);
  });

  it("limits radial directional candidates to parent and direct children", () => {
    const layout = radialTreeLayout(tree(), 1000, 700);
    const selected = layout.nodes.find(({ node }) => node.id === "a")!;
    const candidates = directionalConnectedCandidates(selected, layout.nodes, { x: 1, y: 0 });
    expect(candidates.every(({ node }) => node.id === "root" || node.id === "a1")).toBe(true);
    expect(candidates.some(({ node }) => node.id === "b")).toBe(false);
  });

  it("lays out root children clockwise and bottom-half children counterclockwise", () => {
    const branch = (id: string): OrganizerNode => ({
      id, name: id.toUpperCase(), children: [1, 2].map((index) => ({ id: `${id}${index}`, name: `${id}${index}`, children: [] })),
    });
    const root: OrganizerNode = { id: "root", name: "Root", children: [branch("a"), branch("b"), branch("c"), branch("d")] };
    const layout = radialTreeLayout(root, 1000, 700);
    const angle = (id: string) => layout.nodes.find(({ node }) => node.id === id)!.angle;

    expect(["a", "b", "c", "d"].map(angle)).toEqual([...["a", "b", "c", "d"].map(angle)].sort((left, right) => left - right));
    expect(angle("a1")).toBeLessThan(angle("a2"));
    expect(angle("d1")).toBeLessThan(angle("d2"));
    expect(angle("b1")).toBeGreaterThan(angle("b2"));
    expect(angle("c1")).toBeGreaterThan(angle("c2"));
  });

  it("uses the bottom edge of the root as the direction boundary", () => {
    const chain = (depth: number, id: string): OrganizerNode => depth === 0
      ? { id, name: id, children: [] }
      : { id, name: id, children: [chain(depth - 1, `${id}-next`)] };
    const nearRoot: OrganizerNode = {
      id: "root", name: "Root", children: [{ id: "near", name: "Near", children: [chain(18, "near-first"), { id: "near-second", name: "Second", children: [] }] }],
    };
    const belowRoot: OrganizerNode = {
      id: "root", name: "Root", children: [{ id: "step", name: "Step", children: [{ id: "below", name: "Below", children: [chain(17, "below-first"), { id: "below-second", name: "Second", children: [] }] }] }],
    };
    const nearLayout = radialTreeLayout(nearRoot, 1000, 700);
    const belowLayout = radialTreeLayout(belowRoot, 1000, 700);
    const nearAngle = (id: string) => nearLayout.nodes.find(({ node }) => node.id === id)!.angle;
    const belowAngle = (id: string) => belowLayout.nodes.find(({ node }) => node.id === id)!.angle;

    expect(nearLayout.nodes.find(({ node }) => node.id === "near")!.y).toBeLessThanOrEqual(nearLayout.centerY + 24);
    expect(nearAngle("near-first")).toBeLessThan(nearAngle("near-second"));
    expect(belowLayout.nodes.find(({ node }) => node.id === "below")!.y).toBeGreaterThan(belowLayout.centerY + 24);
    expect(belowAngle("below-first")).toBeGreaterThan(belowAngle("below-second"));
  });

  it("opens the selected node's parent path in the Voronoi view", () => {
    const root = tree();
    expect(voronoiPathForSelection(root, "a1").map(({ id }) => id)).toEqual(["root", "a"]);
    expect(voronoiPathForSelection(root, "root").map(({ id }) => id)).toEqual(["root"]);
  });
});

import { describe, expect, it } from "vitest";
import { duplicateTree, ELEMENT_TEXT_LIMIT, flattenTree, importGuestAsBranch, normalizeNode, radialTreeLayout, directionalConnectedCandidates, voronoiPathForSelection } from "./index";
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
    const duplicate = duplicateTree(original, [original]);
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

  it("opens the selected node's parent path in the Voronoi view", () => {
    const root = tree();
    expect(voronoiPathForSelection(root, "a1").map(({ id }) => id)).toEqual(["root", "a"]);
    expect(voronoiPathForSelection(root, "root").map(({ id }) => id)).toEqual(["root"]);
  });
});

import { describe, expect, it } from "vitest";
import { hierarchyTarget } from "./hierarchy-navigation";
import type { OrganizerNode } from "./types";

function fixture(): OrganizerNode {
  return { id: "root", name: "Root", children: [
    { id: "a", name: "A", children: [{ id: "a1", name: "A1", children: [] }] },
    { id: "b", name: "B", children: [] },
    { id: "c", name: "C", children: [] },
  ] };
}

describe("Map hierarchy navigation", () => {
  it("enters the earlier middle child below and above the root", () => {
    for (const [count, expected] of [[0, undefined], [1, "child-0"], [2, "child-0"], [3, "child-1"], [4, "child-1"], [5, "child-2"]] as const) {
      const root = fixture(), parent = root.children[0];
      parent.children = Array.from({ length: count }, (_, i) => ({ id: `child-${i}`, name: "Child", children: [] }));
      for (const y of [0, 200]) {
        const positions = [{ node: root, x: 0, y: 100 }, { node: parent, x: 0, y }];
        expect(hierarchyTarget(root, "a", y < 100 ? "ArrowUp" : "ArrowDown", positions)?.node.id).toBe(expected);
      }
    }
  });
  it("reverses the sibling cycle for direct children below the root", () => {
    const root = fixture();
    for (const shift of [0, -800]) {
      const positions = [{ node: root, x: 0, y: 100 + shift }, { node: root.children[0], x: 0, y: 200 + shift }];
      for (const y of [0, 100, 200]) {
        positions[1].y = y + shift;
        expect(hierarchyTarget(root, "a", "ArrowLeft", positions)?.node.id).toBe(y > 100 ? "b" : "c");
        expect(hierarchyTarget(root, "a", "ArrowRight", positions)?.node.id).toBe(y > 100 ? "c" : "b");
        expect(hierarchyTarget(root, "b", "ArrowRight", positions)?.node.id).toBe("c");
        expect(hierarchyTarget(root, "c", "ArrowRight", positions)?.node.id).toBe("a");
      }
    }
  });
  it("uses the immediate parent's position for deeper sibling navigation", () => {
    const root = fixture(), parent = root.children[0];
    parent.children.push({ id: "a2", name: "A2", children: [] }, { id: "a3", name: "A3", children: [] });
    const positions = [
      { node: root, x: 0, y: 100 },
      { node: parent, x: 0, y: 200 },
      { node: parent.children[0], x: 0, y: 0 },
    ];
    expect(hierarchyTarget(root, "a1", "ArrowLeft", positions)?.node.id).toBe("a2");
    expect(hierarchyTarget(root, "a1", "ArrowRight", positions)?.node.id).toBe("a3");
    expect(hierarchyTarget(root, "a1", "ArrowDown", positions)?.node.id).toBe("a");
    positions[1].y = 0;
    positions[2].y = 200;
    expect(hierarchyTarget(root, "a1", "ArrowLeft", positions)?.node.id).toBe("a3");
    expect(hierarchyTarget(root, "a1", "ArrowRight", positions)?.node.id).toBe("a2");
  });
  it("navigates from the root spatially, ignoring grandchildren and breaking ties by distance", () => {
    const root = fixture();
    const positions = [
      { node: root, x: 100, y: 100 },
      { node: root.children[0], x: 100, y: 0 },
      { node: root.children[1], x: 200, y: 100 },
      { node: root.children[2], x: 150, y: 100 },
      { node: root.children[0].children[0], x: 100, y: 200 },
    ];
    expect(hierarchyTarget(root, "root", "ArrowUp", positions)?.node.id).toBe("a");
    expect(hierarchyTarget(root, "root", "ArrowRight", positions)?.node.id).toBe("c");
    expect(hierarchyTarget(root, "root", "ArrowDown", positions)).toBeNull();
    expect(hierarchyTarget(root, "root", "ArrowLeft", positions)).toBeNull();
    positions[3].y = 110;
    expect(hierarchyTarget(root, "root", "ArrowRight", positions)?.node.id).toBe("b");
  });
  it("flips parent and child keys above the root, preserving sibling wrapping", () => {
    const root = fixture();
    const positions = [{ node: root, x: 0, y: 300 }, { node: root.children[0], x: 0, y: 100 }];
    expect(hierarchyTarget(root, "a", "ArrowDown", positions)?.node.id).toBe("root");
    expect(hierarchyTarget(root, "a", "ArrowUp", positions)?.node.id).toBe("a1");
    expect(hierarchyTarget(root, "a", "ArrowLeft", positions)?.node.id).toBe("c");
    expect(hierarchyTarget(root, "a", "ArrowRight", positions)?.node.id).toBe("b");
    expect(hierarchyTarget(root, "root", "ArrowUp", positions)?.node.id).toBe("a");
    expect(hierarchyTarget(root, "root", "ArrowDown", positions)).toBeNull();
  });
  it("keeps normal keys below or level with the root, regardless of camera translation", () => {
    const root = fixture();
    for (const y of [300, 500]) {
      for (const shift of [0, -800]) {
        const positions = [{ node: root, x: 0, y: 300 + shift }, { node: root.children[0], x: 0, y: y + shift }];
        expect(hierarchyTarget(root, "a", "ArrowUp", positions)?.node.id).toBe("root");
        expect(hierarchyTarget(root, "a", "ArrowDown", positions)?.node.id).toBe("a1");
      }
    }
  });
  it("enters an only child and returns to the parent", () => {
    const root = fixture();
    expect(hierarchyTarget(root, "a", "ArrowDown")?.node.id).toBe("a1");
    expect(hierarchyTarget(root, "a1", "ArrowUp")?.node.id).toBe("a");
  });
  it("wraps siblings in both directions without traversing descendants", () => {
    const root = fixture();
    expect(hierarchyTarget(root, "a", "ArrowLeft")?.node.id).toBe("c");
    expect(hierarchyTarget(root, "c", "ArrowRight")?.node.id).toBe("a");
    expect(hierarchyTarget(root, "a", "ArrowRight")?.node.id).toBe("b");
    expect(hierarchyTarget(root, "c", "ArrowLeft")?.node.id).toBe("b");
  });
  it("stays put at root, leaf, only-child and missing-node boundaries", () => {
    const root = fixture();
    for (const key of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]) expect(hierarchyTarget(root, "root", key)).toBeNull();
    for (const key of ["ArrowDown", "ArrowLeft", "ArrowRight"]) expect(hierarchyTarget(root, "a1", key)).toBeNull();
    expect(hierarchyTarget(root, "missing", "ArrowDown")).toBeNull();
  });
  it("uses current order after rearranging, deleting and adding siblings", () => {
    const root = fixture();
    root.children.reverse();
    root.children.splice(1, 1);
    expect(hierarchyTarget(root, "c", "ArrowRight")?.node.id).toBe("a");
    root.children.push({ id: "d", name: "D", children: [] });
    expect(hierarchyTarget(root, "a", "ArrowRight")?.node.id).toBe("d");
  });
});

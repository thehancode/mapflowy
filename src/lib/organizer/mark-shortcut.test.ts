import { describe, expect, it } from "vitest";
import { MarkShortcut } from "./mark-shortcut";

describe("double Space marking", () => {
  it("requires two presses and consumes each pair", () => {
    const shortcut = new MarkShortcut(), node = {};
    expect(shortcut.press(node, "tree", 100)).toBe(false);
    expect(shortcut.press(node, "tree", 600)).toBe(true);
    expect(shortcut.press(node, "tree", 700)).toBe(false);
    expect(shortcut.press(node, "tree", 800)).toBe(true);
  });

  it("ignores repeats without extending the deadline", () => {
    const shortcut = new MarkShortcut(), node = {};
    expect(shortcut.press(node, "file", 100)).toBe(false);
    expect(shortcut.press(node, "file", 500, true)).toBe(false);
    expect(shortcut.press(node, "file", 650)).toBe(false);
    expect(shortcut.press(node, "file", 700)).toBe(true);
  });

  it("resets when the node, view, or interaction context changes", () => {
    const shortcut = new MarkShortcut(), first = {}, second = {};
    expect(shortcut.press(first, "tree", 0)).toBe(false);
    expect(shortcut.press(second, "tree", 100)).toBe(false);
    expect(shortcut.press(second, "voronoi", 200)).toBe(false);
    shortcut.reset();
    expect(shortcut.press(second, "voronoi", 300)).toBe(false);
    expect(shortcut.press(second, "voronoi", 400)).toBe(true);
  });
});

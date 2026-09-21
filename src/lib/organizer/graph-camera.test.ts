import { describe, expect, it } from "vitest";
import { graphCameraForSelection, mobileGraphScene } from "./graph-camera";
import type { OrganizerNode } from "./types";

const leaf = (id: string): OrganizerNode => ({ id, name: `Node ${id}`, children: [] });

describe("mobile graph camera", () => {
  it("keeps a small graph inside the viewport", () => {
    const root: OrganizerNode = { id: "root", name: "Root", children: [leaf("a"), leaf("b")] };
    const scene = mobileGraphScene(root, 360, 600);
    expect(scene.width).toBe(360);
    expect(scene.height).toBe(600);
    expect(graphCameraForSelection(scene, "root", 360, 600)).toEqual({ x: 0, y: 0 });
  });

  it("expands a crowded graph beyond the mobile viewport", () => {
    const root: OrganizerNode = { id: "root", name: "Root", children: Array.from({ length: 24 }, (_, index) => leaf(String(index))) };
    const scene = mobileGraphScene(root, 360, 600);
    expect(scene.width).toBeGreaterThan(360);
    expect(scene.height).toBeGreaterThan(600);
  });

  it("keeps the selection in the safe region and clamps the camera", () => {
    const branch = (id: string): OrganizerNode => ({ id, name: id, children: [leaf(`${id}-1`), leaf(`${id}-2`), leaf(`${id}-3`)] });
    const root: OrganizerNode = { id: "root", name: "Root", children: Array.from({ length: 10 }, (_, index) => branch(String(index))) };
    const scene = mobileGraphScene(root, 360, 600);
    for (const id of ["0", "3", "7", "9-3"]) {
      const camera = graphCameraForSelection(scene, id, 360, 600);
      expect(camera.x).toBeGreaterThanOrEqual(0);
      expect(camera.y).toBeGreaterThanOrEqual(0);
      expect(camera.x).toBeLessThanOrEqual(scene.width - 360);
      expect(camera.y).toBeLessThanOrEqual(scene.height - 600);
    }
    const camera = graphCameraForSelection(scene, "7", 360, 600);
    const selected = scene.layout.nodes.find(({ node }) => node.id === "7")!;
    expect(selected.x - camera.x).toBeGreaterThanOrEqual(360 * .2 - .001);
    expect(selected.x - camera.x).toBeLessThanOrEqual(360 * .8 + .001);
    expect(selected.y - camera.y).toBeGreaterThanOrEqual(600 * .2 - .001);
    expect(selected.y - camera.y).toBeLessThanOrEqual(600 * .8 + .001);
  });
});

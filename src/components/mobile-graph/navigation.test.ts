import { afterEach, describe, expect, it, vi } from "vitest";
import { bounded } from "./motion";
import { demoSession } from "./demo";
import { NavigationController } from "./controller";
import { graphCameraForSelection, mobileGraphScene } from "../../lib/organizer/graph-camera";
import type { GraphFrame } from "../organizer/navigation-extension";
import type { OrganizerApp } from "../organizer/organizer-app";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function gestureHarness() {
  const events = new EventTarget();
  vi.stubGlobal("document", new EventTarget());
  vi.stubGlobal("window", Object.assign(new EventTarget(), { setTimeout, clearTimeout }));
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("MouseEvent", Event);
  const node = new EventTarget();
  const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 360, height: 550 }), setPointerCapture: vi.fn(), hasPointerCapture: () => false };
  const app = { shadowRoot: events, requestUpdate: vi.fn() } as unknown as OrganizerApp;
  const controller = new NavigationController(() => {});
  const root = demoSession().workspace.maps[0], scene = mobileGraphScene(root, 360, 550);
  controller.resolve({ scene, width: 360, height: 550, selectedId: root.id, focusId: root.id, automatic: { x: 80, y: 80 }, editing: false });
  controller.attach(app);
  function send(type: string, x: number, y: number, onNode = false, pointerType = "mouse") {
    const event = new Event(type, { cancelable: true });
    Object.defineProperties(event, {
      target: { value: { closest: (selector: string) => selector === ".tree-node" ? (onNode ? node : null) : canvas } },
      isPrimary: { value: true }, pointerId: { value: 1 }, button: { value: 0 },
      clientX: { value: x }, clientY: { value: y }, pointerType: { value: pointerType },
    });
    events.dispatchEvent(event); return event;
  }
  return { controller, canvas, node, send };
}

describe("navigation prototypes", () => {
  it("requires deliberate movement, then drags freely and suppresses the release click", () => {
    const { controller, send } = gestureHarness();
    send("pointerdown", 100, 100);
    send("pointermove", 105, 100);
    expect(controller.camera).toEqual({ x: 80, y: 80 });
    send("pointermove", 110, 100);
    expect(controller.camera).toEqual({ x: 80, y: 80 });
    send("pointermove", 130, 115);
    expect(controller.camera).toEqual({ x: 60, y: 65 });
    send("pointerup", 130, 115);
    expect(send("click", 130, 115).defaultPrevented).toBe(true);
    send("pointermove", 150, 120);
    expect(controller.camera).toEqual({ x: 60, y: 65 });
    controller.disconnect();
  });
  it("never captures or pans gestures beginning on a node or its label", () => {
    const { controller, canvas, send } = gestureHarness();
    send("pointerdown", 100, 100, true);
    send("pointermove", 180, 180, true);
    expect(canvas.setPointerCapture).not.toHaveBeenCalled();
    expect(controller.camera).toEqual({ x: 80, y: 80 });
    controller.disconnect();
  });
  it("opens the node menu on hold and suppresses selection even after a prolonged hold", () => {
    vi.useFakeTimers();
    const { controller, node, send } = gestureHarness();
    const menu = vi.fn(); node.addEventListener("contextmenu", menu);
    send("pointerdown", 100, 100, true, "touch");
    send("pointermove", 102, 101, true, "touch");
    vi.advanceTimersByTime(2000);
    expect(menu).toHaveBeenCalledOnce();
    send("pointerup", 102, 101, true, "touch");
    expect(send("click", 102, 101, true).defaultPrevented).toBe(true);
    expect(controller.camera).toEqual({ x: 80, y: 80 });
    controller.disconnect();
  });
  it("clamps free movement and handles a canvas smaller than its viewport", () => {
    expect(bounded({ x: -2, y: 200 }, { x: 50, y: 90 })).toEqual({ x: 0, y: 90 });
    expect(bounded({ x: 10, y: 10 }, { x: -20, y: -10 })).toEqual({ x: 0, y: 0 });
  });
  it("isolates demo sessions and contains enough depth and density", () => {
    const a = demoSession(), b = demoSession();
    a.storage.setItem("mapflowy-maps-v1", "changed");
    a.workspace.maps[0].name = "Edited";
    expect(b.storage.getItem("mapflowy-maps-v1")).toBeNull();
    expect(b.workspace.maps[0].name).toBe("Studio");
    const scene = mobileGraphScene(b.workspace.maps[0], 360, 550);
    expect(scene.layout.nodes.length).toBeGreaterThan(30);
    expect(Math.max(...scene.layout.nodes.map(n => n.depth))).toBe(3);
    expect(scene.width).toBeGreaterThan(360);
  });
  it("records history only for changed selections and preserves camera snapshots", () => {
    const root = demoSession().workspace.maps[0];
    const scene = mobileGraphScene(root, 360, 550);
    const frame = (id: string): GraphFrame => ({ scene, width: 360, height: 550, selectedId: id, focusId: id, automatic: graphCameraForSelection(scene, id, 360, 550), editing: false });
    const controller = new NavigationController(() => {});
    const initial = controller.resolve(frame(root.id));
    controller.select(root.id);
    expect(controller.history).toHaveLength(0);
    controller.select("branch-0");
    controller.resolve(frame("branch-0"));
    expect(controller.history).toEqual([{ id: root.id, camera: initial }]);
    controller.back();
    expect(controller.resolve(frame(root.id))).toEqual(initial);
    expect(controller.history).toHaveLength(0);
  });
  it("restores a manually dragged camera when returning from another selection", () => {
    const { controller, send } = gestureHarness();
    const initial = controller.frame!;
    send("pointerdown", 100, 100);
    send("pointermove", 110, 100);
    send("pointermove", 130, 115);
    send("pointerup", 130, 115);
    const panned = { ...controller.camera };
    // The fake host only needs to replay selection when Back calls into it.
    controller.disconnect();
    const next = { ...initial, selectedId: "branch-0", focusId: "branch-0", automatic: { x: 10, y: 20 } };
    controller.select("branch-0");
    controller.resolve(next);
    expect(controller.history).toEqual([{ id: initial.selectedId, camera: panned }]);
    controller.back();
    expect(controller.resolve(initial)).toEqual(panned);
    expect(controller.history).toHaveLength(0);
  });
});

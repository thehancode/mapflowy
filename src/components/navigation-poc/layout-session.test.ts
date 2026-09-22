import { afterEach, describe, expect, it, vi } from "vitest";
import { demoSession } from "./demo";
import { computeLayout, type LayoutRequest, type LayoutResult } from "./layouts";
import { LayoutSession } from "./layout-session";

afterEach(() => vi.unstubAllGlobals());

class FakeWorker {
  static instances: FakeWorker[] = [];
  request?: LayoutRequest;
  onmessage?: (event: { data: { result: LayoutResult } }) => void;
  onerror?: () => void;
  terminate = vi.fn();
  constructor() { FakeWorker.instances.push(this); }
  postMessage(request: LayoutRequest) { this.request = structuredClone(request); }
  finish() { this.onmessage?.({ data: { result: computeLayout({ ...this.request!, kind: "tidy" }) } }); }
}

describe("offscreen layout lifecycle", () => {
  it("caches scenes across selection/panning updates, invalidating on edits and resize", () => {
    const changed = vi.fn(), session = new LayoutSession("tidy", changed), root = demoSession().workspace.maps[0];
    const first = session.get(root, 390, 640);
    expect(session.get(root, 390, 640)).toBe(first);
    expect(changed).toHaveBeenCalledTimes(1);
    root.children[0].name = "Renamed";
    expect(session.get(root, 390, 640)).not.toBe(first);
    const resized = session.get(root, 600, 400);
    expect(resized.width).toBeGreaterThanOrEqual(600);
    expect(changed).toHaveBeenCalledTimes(3);
  });

  it("discards stale worker results and keeps the last completed drawing during edits", () => {
    FakeWorker.instances = []; vi.stubGlobal("Worker", FakeWorker);
    const session = new LayoutSession("planar-spring", vi.fn()), root = demoSession().workspace.maps[0];
    const blank = session.get(root, 390, 640);
    expect(blank.layout.nodes).toHaveLength(0);
    expect(session.busy).toBe(true);
    const first = FakeWorker.instances[0];
    root.children.push({ id: "new", name: "New", children: [] });
    session.get(root, 390, 640);
    expect(first.terminate).toHaveBeenCalled();
    first.finish();
    expect(session.get(root, 390, 640)).toBe(blank);
    expect(session.busy).toBe(true);
    FakeWorker.instances[1].finish();
    const completed = session.get(root, 390, 640);
    expect(completed.layout.nodes.some(n => n.node.id === "new")).toBe(true);
    expect(session.busy).toBe(false);
    expect(FakeWorker.instances).toHaveLength(2);
    root.children.pop();
    root.name = "An edited label awaiting layout";
    expect(session.get(root, 390, 640)).toBe(completed);
    expect(completed.layout.nodes[0].node.name).toBe("Studio");
    const latest = FakeWorker.instances[2];
    session.dispose(); latest.finish();
    expect(latest.terminate).toHaveBeenCalled();
  });

  it("reports a validated fallback when workers cannot run", () => {
    vi.stubGlobal("Worker", class { constructor() { throw new Error("Unavailable"); } });
    const session = new LayoutSession("spring", vi.fn());
    const scene = session.get(demoSession().workspace.maps[0], 390, 640);
    expect(scene.layout.nodes.length).toBeGreaterThan(30);
    expect(session.busy).toBe(false);
    expect(session.notice).toContain("validated tidy");
  });
});

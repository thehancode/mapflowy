import { flattenTree } from "../../lib/organizer";
import type { LayoutEntry, OrganizerNode } from "../../lib/organizer";
import type { MobileGraphScene } from "../../lib/organizer/graph-camera";
import { computeLayout, footprintsFor, safeTidy, type Drawing, type Footprints, type LayoutKind, type LayoutResult } from "./layouts";

export function sceneFromDrawing(root: OrganizerNode, drawing: Drawing, width: number, height: number): MobileGraphScene {
  const minX = drawing.nodes.length ? Math.min(...drawing.nodes.map(n => n.x + n.box.left)) : 0, maxX = drawing.nodes.length ? Math.max(...drawing.nodes.map(n => n.x + n.box.right)) : 0;
  const minY = drawing.nodes.length ? Math.min(...drawing.nodes.map(n => n.y + n.box.top)) : 0, maxY = drawing.nodes.length ? Math.max(...drawing.nodes.map(n => n.y + n.box.bottom)) : 0;
  const sceneWidth = Math.max(width, maxX - minX + 96), sceneHeight = Math.max(height, maxY - minY + 96);
  const dx = (sceneWidth - (maxX - minX)) / 2 - minX, dy = (sceneHeight - (maxY - minY)) / 2 - minY;
  const positions = new Map(drawing.nodes.map(n => [n.id, n]));
  // Keep the last completed labels/structure frozen while the next worker runs.
  const nodes: LayoutEntry[] = flattenTree(structuredClone(root)).filter(e => positions.has(e.node.id)).map(entry => {
    const p = positions.get(entry.node.id)!;
    return { ...entry, x: p.x + dx, y: p.y + dy, angle: 0, radius: entry.depth };
  });
  const byId = new Map(nodes.map(n => [n.node.id, n]));
  return { width: sceneWidth, height: sceneHeight, layout: { nodes,
    links: nodes.flatMap(target => target.parent && byId.has(target.parent.id) ? [{ source: byId.get(target.parent.id)!, target }] : []),
    centerX: sceneWidth / 2, centerY: sceneHeight / 2, outerRadiusX: sceneWidth / 2, outerRadiusY: sceneHeight / 2 } };
}

/** Cached graph geometry. No frame-by-frame simulation enters the UI. */
export class LayoutSession {
  busy = false;
  notice = "";
  private key = "";
  private scene?: MobileGraphScene;
  private worker?: Worker;
  private revision = 0;
  private measure?: (text: string) => number;
  private measureFont = "";
  constructor(readonly kind: LayoutKind, private changed: () => void) {}

  get(root: OrganizerNode, width: number, height: number): MobileGraphScene {
    const content = flattenTree(root).map(e => [e.node.id, e.node.name, e.parent?.id]);
    const key = JSON.stringify([content, width, height]);
    if (key === this.key && this.scene) {
      const current = new Map(flattenTree(root).map(e => [e.node.id, e.node]));
      for (const entry of this.scene.layout.nodes) {
        const node = current.get(entry.node.id);
        if (node) { entry.node.marked = node.marked; entry.node.colorIndex = node.colorIndex; }
      }
      return this.scene;
    }
    this.key = key;
    const revision = ++this.revision;
    this.worker?.terminate(); this.worker = undefined;
    const footprints = this.measureFootprints(root, width);
    const complete = (result: LayoutResult, message = "") => {
      if (revision !== this.revision) return;
      this.scene = sceneFromDrawing(root, result, width, height);
      this.notice = message || (result.fallback ? "Spacing fallback: using a validated tidy layout." : "");
      this.busy = false; this.worker?.terminate(); this.worker = undefined;
      this.changed();
    };
    const fallback = () => {
      try { complete({ ...safeTidy(root, footprints), fallback: true }, "Spring layout unavailable; showing validated tidy spacing."); }
      catch { this.busy = false; this.worker?.terminate(); this.worker = undefined; this.notice = "Unable to calculate a safe layout. Try Reset."; this.changed(); }
    };
    if (this.kind !== "spring" && this.kind !== "planar-spring") {
      try { complete(computeLayout({ root, footprints, kind: this.kind })); }
      catch { fallback(); }
    } else {
      this.busy = true; this.notice = "Calculating final spacing…";
      // Initially blank; later edits keep the last completed drawing until a result arrives.
      if (!this.scene) this.scene = sceneFromDrawing(root, { nodes: [], edges: [] }, width, height);
      try {
        this.worker = new Worker(new URL("./layout.worker.ts", import.meta.url), { type: "module" });
        this.worker.onmessage = (event: MessageEvent<{ result?: LayoutResult; error?: string }>) => {
          if (revision !== this.revision) return;
          if (event.data.result) complete(event.data.result); else fallback();
        };
        this.worker.onerror = () => { if (revision === this.revision) fallback(); };
        this.worker.postMessage({ root, footprints, kind: this.kind });
      } catch { fallback(); }
      this.changed();
    }
    return this.scene ?? sceneFromDrawing(root, { nodes: [], edges: [] }, width, height);
  }

  private measureFootprints(root: OrganizerNode, width: number): Footprints {
    const font = `750 ${width <= 600 ? 10 : 12}px Inter, ui-sans-serif, system-ui, sans-serif`;
    if (typeof document !== "undefined" && font !== this.measureFont) {
      const context = document.createElement("canvas").getContext("2d");
      if (context) { context.font = font; this.measure = text => context.measureText(text).width; this.measureFont = font; }
    }
    return footprintsFor(root, this.measure);
  }

  dispose(): void { this.revision++; this.worker?.terminate(); this.worker = undefined; }
}

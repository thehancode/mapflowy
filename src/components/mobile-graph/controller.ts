import { html, nothing } from "lit";
import type { Point } from "../../lib/organizer";
import type { OrganizerApp } from "../organizer/organizer-app";
import type { GraphFrame, GraphNavigationAdapter } from "../organizer/navigation-extension";
import { bounded } from "./motion";

type Snapshot = { id: string; camera: Point };
type Gesture = { id: number; start: Point; current: Point; anchor: Point; origin: Point; active: boolean; svg: SVGSVGElement };

export class NavigationController implements GraphNavigationAdapter {
  instant = false;
  frame?: GraphFrame;
  camera: Point = { x: 0, y: 0 };
  history: Snapshot[] = [];
  private manual?: Point;
  private restoring = false;
  private app?: OrganizerApp;
  private abort?: AbortController;
  private gesture?: Gesture;
  private suppressClickUntil = 0;
  private nodeHold?: number;
  private holdStart?: Point;
  private holdOpened = false;

  constructor(private changed: () => void) {}

  resolve(frame: GraphFrame): Point {
    const previous = this.frame;
    if (previous && previous.focusId !== frame.focusId && !this.restoring) this.manual = undefined;
    if (previous && previous.scene.layout.nodes[0]?.node.id !== frame.scene.layout.nodes[0]?.node.id) {
      this.history = []; this.manual = undefined; this.changed();
    }
    this.frame = frame;
    this.camera = bounded(this.manual ?? frame.automatic, this.bounds);
    this.restoring = false;
    return this.camera;
  }

  get bounds(): Point {
    return { x: Math.max(0, (this.frame?.scene.width ?? 0) - (this.frame?.width ?? 0)), y: Math.max(0, (this.frame?.scene.height ?? 0) - (this.frame?.height ?? 0)) };
  }

  select(id: string): void {
    if (!this.restoring && this.frame && id !== this.frame.selectedId) {
      this.history.push({ id: this.frame.selectedId, camera: { ...this.camera } });
      this.history = this.history.slice(-50); this.changed();
    }
    if (!this.restoring) { this.manual = undefined; this.instant = false; }
  }

  back(): void {
    let previous: Snapshot | undefined;
    while ((previous = this.history.pop())) {
      if (this.frame?.scene.layout.nodes.some(({ node }) => node.id === previous!.id)) break;
    }
    if (previous) {
      this.restoring = true; this.manual = previous.camera; this.instant = false;
      this.app?.focusGraphNode(previous.id); this.app?.requestUpdate();
    }
    this.changed();
  }

  attach(app: OrganizerApp): void {
    if (this.app === app) return;
    this.app = app; this.abort = new AbortController();
    const options = { signal: this.abort.signal, capture: true };
    const root = app.shadowRoot!;
    root.addEventListener("pointerdown", this.down as EventListener, options);
    root.addEventListener("pointermove", this.move as EventListener, options);
    root.addEventListener("pointerup", this.up as EventListener, options);
    root.addEventListener("pointercancel", this.cancel, options);
    root.addEventListener("lostpointercapture", this.cancel, options);
    root.addEventListener("click", this.click, options);
    document.addEventListener("visibilitychange", this.cancel, options);
    window.addEventListener("blur", this.cancel, options);
  }

  disconnect(): void { this.cancel(); this.abort?.abort(); this.app = undefined; }
  private cancelHold(): void { if (this.nodeHold) window.clearTimeout(this.nodeHold); this.nodeHold = undefined; this.holdStart = undefined; }
  private cancel = (): void => {
    this.cancelHold();
    if (this.holdOpened) this.suppressClickUntil = performance.now() + 500;
    this.holdOpened = false;
    const gesture = this.gesture;
    this.gesture = undefined;
    if (gesture?.svg.hasPointerCapture(gesture.id)) gesture.svg.releasePointerCapture(gesture.id);
    this.app?.requestUpdate();
  };
  private click = (event: Event): void => {
    if (performance.now() < this.suppressClickUntil) { event.preventDefault(); event.stopImmediatePropagation(); }
  };
  private point(event: PointerEvent, canvas: SVGSVGElement): Point {
    const box = canvas.getBoundingClientRect();
    return { x: (event.clientX - box.left) * (this.frame!.width / box.width), y: (event.clientY - box.top) * (this.frame!.height / box.height) };
  }
  private down = (event: PointerEvent): void => {
    if (!event.isPrimary || this.gesture) { this.cancel(); return; }
    if (event.button !== 0 || this.frame?.editing) return;
    const target = event.target as Element;
    const canvas = target.closest<SVGSVGElement>("svg[data-graph-canvas]");
    if (!canvas) return;
    const node = target.closest(".tree-node");
    if (node) {
      if (event.pointerType === "touch") {
        this.holdStart = { x: event.clientX, y: event.clientY };
        this.nodeHold = window.setTimeout(() => {
          this.holdOpened = true;
          this.suppressClickUntil = performance.now() + 700;
          node.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: event.clientX, clientY: event.clientY }));
        }, 500);
      }
      return;
    }
    if (!this.frame) return;
    const point = this.point(event, canvas);
    // Capture only background gestures. Labels explicitly receive pointer events.
    this.gesture = { id: event.pointerId, start: point, current: point, anchor: point, origin: { ...this.camera }, active: false, svg: canvas };
    canvas.setPointerCapture(event.pointerId);
  };
  private move = (event: PointerEvent): void => {
    if (this.holdStart && Math.hypot(event.clientX - this.holdStart.x, event.clientY - this.holdStart.y) > 8) this.cancelHold();
    const gesture = this.gesture;
    if (!gesture || event.pointerId !== gesture.id) return;
    gesture.current = this.point(event, gesture.svg);
    const delta = { x: gesture.current.x - gesture.start.x, y: gesture.current.y - gesture.start.y };
    if (!gesture.active) {
      if (Math.hypot(delta.x, delta.y) < 8) return;
      gesture.active = true; gesture.anchor = gesture.current;
      this.instant = true;
    }
    event.preventDefault(); event.stopPropagation();
    this.suppressClickUntil = performance.now() + 500;
    const movement = { x: gesture.current.x - gesture.anchor.x, y: gesture.current.y - gesture.anchor.y };
    this.setCamera({ x: gesture.origin.x - movement.x, y: gesture.origin.y - movement.y });
  };
  private up = (event: PointerEvent): void => {
    if (this.gesture?.active) { event.preventDefault(); this.suppressClickUntil = performance.now() + 500; }
    this.cancel();
  };
  private setCamera(point: Point): void { this.manual = bounded(point, this.bounds); this.camera = this.manual; this.app?.requestUpdate(); }
  overlay() { return nothing; }

  actions() {
    const label = this.app?.language === "es" ? "Volver a la vista anterior" : "Back to previous view";
    return html`<button class="quick-action-button add-node-button" aria-label=${label} title=${label} ?disabled=${!this.history.length || this.frame?.editing} @click=${() => this.back()}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 5 3 12l7 7M3 12h11a6 6 0 0 1 6 6" stroke-linejoin="round" /></svg>
    </button>`;
  }
}

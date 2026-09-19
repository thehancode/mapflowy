import { LitElement, css, html, nothing, svg, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import "./view-switcher";
import type { OrganizerNode, Point, LayoutEntry, OrganizerTheme } from "../../lib/organizer";
import {
  circleLayout, createRepository, createUserConfigRepository, findEntry, flattenTree, fitLabel, newNodeId,
  polygonArea, polygonCentroid, radialLinkPath, radialTreeLayout, roundedPolygonPath, visibleItems,
  viewportEdgeBand, viewportEdges, viewportEdgeSpan, voronoiPathForSelection, voronoiPolygons,
} from "../../lib/organizer";
import type { OrganizerView } from "./view-switcher";

const palette = ["#f38b70", "#efc65d", "#71c1b2", "#88afe0", "#b99bdf", "#df9eb6", "#9fc477", "#e5a665"];
const directions: Record<string, Point> = {
  ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
};

function hashString(value: string): number {
  let hash = 2166136261;
  for (const character of value) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}

@customElement("organizer-app")
export class OrganizerApp extends LitElement {
  private readonly configRepository = createUserConfigRepository();
  @property({ reflect: true }) theme: OrganizerTheme = this.configRepository.load().theme;
  @state() private root: OrganizerNode = { id: "node-1", name: "Projects", children: [] };
  @state() private path: OrganizerNode[] = [this.root];
  @state() private selectedId = this.root.id;
  @state() private view: OrganizerView = "voronoi";
  @state() private status = "Loading your organizer…";
  @state() private width = 1200;
  @state() private height = 720;
  @state() private draft: { id: string; parentId: string; restoreId: string; mode: "create" | "edit" } | null = null;
  private readonly repository = createRepository();
  private resizeObserver?: ResizeObserver;
  private treeCycles = new Map<string, number>();

  static styles = css`
    :host { --ink: #171a17; --background: #e8e7de; --file-background: #f4f3ec; --panel: rgba(250,249,244,.88); --panel-border: rgba(23,26,23,.13); --shadow: rgba(23,26,23,.12); --muted: #686a63; --cell-gap: #faf9f4; --edge-overlay: rgba(255,255,255,.24); --edge-overlay-hover: rgba(255,255,255,.5); --row-hover: rgba(255,255,255,.58); --row-selected: #fff; --editor: rgba(255,255,255,.96); --dialog: #faf9f4; --kbd: #fff; display: block; width: 100%; height: 100dvh; min-height: 0; overflow: hidden; color: var(--ink); background: var(--background); color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    :host([theme="dark"]) { --ink: #f2f0e8; --background: #151612; --file-background: #1b1c18; --panel: rgba(35,36,31,.9); --panel-border: rgba(242,240,232,.16); --shadow: rgba(0,0,0,.38); --muted: #aaa99f; --cell-gap: #151612; --edge-overlay: color-mix(in srgb, var(--ink) 10%, transparent); --edge-overlay-hover: color-mix(in srgb, var(--ink) 22%, transparent); --row-hover: rgba(255,255,255,.06); --row-selected: #292a24; --editor: rgba(38,39,34,.98); --dialog: #23241f; --kbd: #30312b; color-scheme: dark; }
    * { box-sizing: border-box; }
    button, input { font: inherit; }
    .workspace { position: relative; width: 100%; height: 100%; overflow: hidden; outline: none; background: var(--background); }
    .stage { position: absolute; inset: 0; overflow: hidden; }
    .stage.file { overflow: auto; background: var(--file-background); }
    svg { display: block; width: 100%; height: 100%; }
    .topbar { position: absolute; z-index: 10; top: 1rem; left: 1rem; right: 1rem; display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; pointer-events: none; }
    .crumbs, .top-actions { pointer-events: auto; border: 1px solid var(--panel-border); background: var(--panel); box-shadow: 0 10px 32px var(--shadow); backdrop-filter: blur(16px); }
    .crumbs { display: flex; flex-wrap: wrap; gap: .42rem; max-width: min(64vw, 760px); padding: .65rem .85rem; border-radius: 14px; font-size: .8rem; font-weight: 740; }
    .crumbs span:not(:last-child) { color: var(--muted); font-weight: 560; }
    .separator { opacity: .45; }
    .top-actions { display: flex; gap: .25rem; padding: .25rem; border-radius: 999px; }
    .top-actions a, .top-actions button { min-height: 2.25rem; display: inline-flex; align-items: center; padding: 0 .78rem; border: 0; border-radius: 999px; background: transparent; color: var(--ink); text-decoration: none; font-size: .75rem; font-weight: 750; cursor: pointer; }
    .top-actions a { background: var(--ink); color: var(--background); }
    .switcher { position: absolute; z-index: 10; left: 50%; bottom: 1rem; transform: translateX(-50%); }
    .cell { cursor: default; }
    .cell-shape { transition: filter .14s ease; }
    .cell:hover .cell-shape { filter: brightness(.97) saturate(1.05); }
    .cell-outline { fill: none; stroke: var(--cell-gap); stroke-width: 12; stroke-linejoin: round; vector-effect: non-scaling-stroke; pointer-events: none; }
    .cell-label { fill: var(--ink); font-weight: 760; text-anchor: middle; cursor: text; user-select: none; paint-order: stroke; stroke: var(--cell-gap); stroke-width: 3px; stroke-linejoin: round; }
    .dot { fill: color-mix(in srgb, var(--ink) 48%, transparent); pointer-events: none; }
    .selection { fill: none; stroke: var(--ink); stroke-width: 4; vector-effect: non-scaling-stroke; pointer-events: none; }
    .edge-bands { cursor: cell; outline: none; }
    .edge-strip { fill: var(--edge-overlay); stroke: none; transition: fill .14s ease; }
    .edge-bands:hover .edge-strip, .edge-bands:focus-visible .edge-strip { fill: var(--edge-overlay-hover); }
    .add-child-sign { fill: var(--ink); font: 700 28px system-ui, sans-serif; text-anchor: middle; dominant-baseline: central; pointer-events: none; user-select: none; }
    .tree-link { stroke: color-mix(in srgb, var(--ink) 25%, transparent); stroke-width: 2; vector-effect: non-scaling-stroke; }
    .tree-node { cursor: pointer; outline: none; }
    .tree-node .core { stroke: var(--cell-gap); stroke-width: 4; vector-effect: non-scaling-stroke; }
    .tree-node.current .core { stroke: var(--ink); stroke-width: 5; }
    .tree-node text { fill: var(--ink); font-size: 12px; font-weight: 750; text-anchor: middle; paint-order: stroke; stroke: var(--background); stroke-width: 3px; pointer-events: none; }
    .add-ring { fill: none; stroke: var(--ink); stroke-width: 4; opacity: .12; cursor: crosshair; vector-effect: non-scaling-stroke; }
    .add-ring:hover { opacity: .65; }
    .file-tree { min-height: 100%; padding: 5.6rem 1.1rem 5.5rem; }
    .file-row { display: flex; align-items: center; min-height: 44px; margin-left: calc(var(--depth) * 28px); padding: .35rem .65rem; border: 1px solid transparent; border-radius: 9px; cursor: pointer; }
    .file-row:hover { background: var(--row-hover); }
    .file-row.selected { border-color: var(--panel-border); background: var(--row-selected); box-shadow: 0 3px 12px var(--shadow); }
    .branch { width: 20px; color: #eb4d28; }
    .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .9rem; font-weight: 680; }
    .meta { margin-left: auto; padding-left: 1rem; color: var(--muted); font-size: .7rem; }
    .editor { position: absolute; z-index: 20; width: min(280px, 70vw); height: 44px; padding: 0 .75rem; border: 2px solid var(--ink); border-radius: 10px; outline: 0; background: var(--editor); color: var(--ink); font-weight: 700; text-align: center; box-shadow: 0 7px 24px var(--shadow); transform: translate(-50%, -50%); }
    .file-editor { width: min(360px, calc(100% - 30px)); height: 32px; padding: 0 .55rem; border: 2px solid var(--ink); border-radius: 6px; outline: 0; background: var(--editor); color: var(--ink); font-weight: 700; }
    dialog { width: min(460px, calc(100% - 2rem)); border: 1px solid var(--panel-border); border-radius: 18px; padding: 1.2rem; background: var(--dialog); color: var(--ink); box-shadow: 0 30px 90px var(--shadow); }
    dialog::backdrop { background: rgba(23,26,23,.38); backdrop-filter: blur(4px); }
    dialog h2 { margin: 0 0 .5rem; }
    dialog ul { padding-left: 1.2rem; line-height: 1.8; color: var(--muted); }
    dialog button { min-height: 2.5rem; padding: 0 1rem; border: 0; border-radius: 9px; background: var(--ink); color: var(--background); font-weight: 750; cursor: pointer; }
    kbd { padding: .15rem .38rem; border: 1px solid var(--panel-border); border-bottom-width: 2px; border-radius: 5px; background: var(--kbd); font: 700 .72rem system-ui; }
    .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
    :focus-visible { outline: 2px solid #eb4d28; outline-offset: 2px; }
    @media (max-width: 600px) {
      .topbar { top: .65rem; left: .65rem; right: .65rem; }
      .crumbs { max-width: calc(100vw - 9.5rem); }
      .top-actions button:not(.theme-toggle) { display: none; }
      .file-row { margin-left: calc(var(--depth) * 18px); }
      .tree-node text { font-size: 10px; }
    }
    @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; } }
  `;

  connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener("keydown", this.onKeyDown);
  }

  disconnectedCallback(): void {
    document.removeEventListener("keydown", this.onKeyDown);
    this.resizeObserver?.disconnect();
    super.disconnectedCallback();
  }

  protected firstUpdated(): void {
    const workspace = this.renderRoot.querySelector<HTMLElement>(".workspace")!;
    this.resizeObserver = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      this.width = Math.max(320, width); this.height = Math.max(420, height);
    });
    this.resizeObserver.observe(workspace);
    void this.load();
  }

  protected updated(changed: PropertyValues): void {
    if (changed.has("draft") && this.draft) requestAnimationFrame(() => {
      const input = this.renderRoot.querySelector<HTMLInputElement>("[data-draft]");
      input?.focus();
      if (this.draft?.mode === "edit") input?.select();
    });
  }

  private get current(): OrganizerNode { return this.path[this.path.length - 1]; }
  private setStatus(message: string): void { this.status = message; }

  private toggleTheme(): void {
    this.theme = this.theme === "dark" ? "light" : "dark";
    this.configRepository.save({ version: 1, theme: this.theme });
    this.setStatus(`${this.theme === "dark" ? "Dark" : "Light"} mode enabled.`);
  }

  private async load(): Promise<void> {
    this.root = await this.repository.load();
    this.path = [this.root]; this.selectedId = this.root.id; this.treeCycles.clear();
    this.setStatus("Sample project tree loaded. Press ? for keyboard help.");
  }

  private persist(): void { this.repository.save(this.root); this.requestUpdate(); }

  private select(id: string): void { this.selectedId = id; this.setStatus(`${findEntry(this.root, id)?.node.name ?? "Element"} is selected.`); }

  private chooseView(view: OrganizerView): void {
    if (this.draft) this.cancelDraft();
    if (view === "voronoi" && this.view !== "voronoi") {
      this.path = voronoiPathForSelection(this.root, this.selectedId);
    }
    this.view = view;
    this.setStatus(view === "tree" ? "Complete tree view." : view === "file" ? "File tree ready. Enter adds a sibling; Tab indents." : `${this.current.name} level.`);
    this.renderRoot.querySelector<HTMLElement>(".workspace")?.focus();
  }

  private beginDraft(parent: OrganizerNode, restoreId = parent.id, insertionIndex = parent.children.length): void {
    if (this.draft) return;
    const item = { id: newNodeId(flattenTree(this.root).map(({ node }) => node.id)), name: "", children: [] };
    parent.children.splice(insertionIndex, 0, item);
    this.draft = { id: item.id, parentId: parent.id, restoreId, mode: "create" };
    this.selectedId = item.id; this.treeCycles.clear(); this.requestUpdate();
    this.setStatus("New element ready. Type a name and press Enter.");
  }

  private beginFileDraft(child: boolean): void {
    const selected = findEntry(this.root, this.selectedId) ?? findEntry(this.root, this.root.id)!;
    if (child || selected.depth === 0) this.beginDraft(selected.node, selected.node.id, child ? selected.node.children.length : 0);
    else this.beginDraft(selected.parent!, selected.node.id, selected.index + 1);
  }

  private beginEdit(id = this.selectedId): void {
    if (this.draft) return;
    const selected = findEntry(this.root, id);
    if (!selected) return;
    this.selectedId = selected.node.id;
    this.draft = {
      id: selected.node.id,
      parentId: selected.parent?.id ?? selected.node.id,
      restoreId: selected.node.id,
      mode: "edit",
    };
    this.requestUpdate();
    this.setStatus(`Editing ${selected.node.name}. Type a name and press Enter.`);
  }

  private commitDraft(input: HTMLInputElement): void {
    if (!this.draft) return;
    const name = input.value.trim();
    if (!name) { this.cancelDraft(); return; }
    const item = findEntry(this.root, this.draft.id)?.node;
    if (!item) { this.cancelDraft(); return; }
    const mode = this.draft.mode;
    item.name = name; const id = item.id; this.draft = null; this.selectedId = id;
    const entry = findEntry(this.root, id)!;
    if (this.view !== "voronoi") this.path = entry.path;
    this.persist(); this.setStatus(mode === "edit" ? `${name} was renamed.` : `${name} was created.`);
  }

  private cancelDraft(): void {
    if (!this.draft) return;
    const { id, parentId, restoreId, mode } = this.draft;
    if (mode === "edit") {
      this.draft = null; this.requestUpdate(); this.setStatus("Edit cancelled."); return;
    }
    const parent = findEntry(this.root, parentId)?.node;
    if (parent) parent.children = parent.children.filter((child) => child.id !== id);
    this.draft = null; const restored = findEntry(this.root, restoreId) ?? findEntry(this.root, parentId)!;
    this.path = restored.path; this.selectedId = restored.node.id; this.requestUpdate(); this.setStatus("New element cancelled.");
  }

  private draftKey(event: KeyboardEvent): void {
    event.stopPropagation();
    if (event.key === "Enter") { event.preventDefault(); this.commitDraft(event.currentTarget as HTMLInputElement); }
    if (event.key === "Escape") { event.preventDefault(); this.cancelDraft(); }
  }

  private deleteVoronoi(): void {
    if (this.selectedId === this.current.id) { this.setStatus("The current level cannot be removed here."); return; }
    const index = this.current.children.findIndex((node) => node.id === this.selectedId);
    if (index < 0) return;
    const [removed] = this.current.children.splice(index, 1);
    this.selectedId = this.current.children[index]?.id ?? this.current.children[index - 1]?.id ?? this.current.id;
    this.treeCycles.clear(); this.persist(); this.setStatus(`${removed.name} and its nested elements were removed.`);
  }

  private deleteFile(): void {
    const selected = findEntry(this.root, this.selectedId);
    if (!selected?.parent) { this.setStatus("The root element cannot be removed."); return; }
    selected.parent.children = selected.parent.children.filter((node) => node.id !== selected.node.id);
    const parent = findEntry(this.root, selected.parent.id)!;
    this.path = parent.path; this.selectedId = parent.node.id; this.treeCycles.clear(); this.persist();
    this.setStatus(`${selected.node.name} and its nested elements were removed.`);
  }

  private indentFile(): void {
    const selected = findEntry(this.root, this.selectedId);
    if (!selected?.parent || selected.index <= 0) { this.setStatus("This element has no previous sibling to become its parent."); return; }
    const siblings = selected.parent.children; const newParent = siblings[selected.index - 1];
    siblings.splice(selected.index, 1); newParent.children.push(selected.node);
    this.path = findEntry(this.root, selected.node.id)!.path; this.treeCycles.clear(); this.persist();
    this.setStatus(`${selected.node.name} is now a child of ${newParent.name}.`);
  }

  private outdentFile(): void {
    const selected = findEntry(this.root, this.selectedId);
    if (!selected?.parent) { this.setStatus("The root cannot be moved up."); return; }
    const parentEntry = findEntry(this.root, selected.parent.id);
    if (!parentEntry?.parent) { this.setStatus(`${selected.node.name} is already at the first level.`); return; }
    selected.parent.children.splice(selected.index, 1);
    const parentIndex = parentEntry.parent.children.findIndex((node) => node.id === parentEntry.node.id);
    parentEntry.parent.children.splice(parentIndex + 1, 0, selected.node);
    this.path = findEntry(this.root, selected.node.id)!.path; this.treeCycles.clear(); this.persist();
    this.setStatus(`${selected.node.name} moved up one level.`);
  }

  private moveVoronoi(key: string): void {
    const items = visibleItems(this.current), points = circleLayout(items.length);
    const index = items.findIndex((item) => item.id === this.selectedId), selected = points[index];
    if (!selected) return;
    const direction = directions[key]; let best: { index: number; distance: number; forward: number } | null = null;
    points.forEach((point, candidate) => {
      if (candidate === index) return;
      const dx = point.x - selected.x, dy = point.y - selected.y, forward = dx * direction.x + dy * direction.y;
      if (forward <= 1e-5) return;
      const distance = Math.hypot(dx, dy);
      if (!best || distance < best.distance - 1e-6 || (Math.abs(distance - best.distance) < 1e-6 && forward > best.forward)) best = { index: candidate, distance, forward };
    });
    if (best) this.select(items[(best as { index: number }).index].id);
  }

  private moveTree(key: string): void {
    const layout = radialTreeLayout(this.root, this.width, this.height);
    const selected = layout.nodes.find((entry) => entry.node.id === this.selectedId) ?? layout.nodes.find((entry) => entry.node.id === this.current.id);
    if (!selected) return;
    const allowed = new Set([...(selected.parent ? [selected.parent.id] : []), ...selected.node.children.map((node) => node.id)]);
    const direction = directions[key];
    const candidates = layout.nodes.map((entry, order) => ({ entry, order, dx: entry.x - selected.x, dy: entry.y - selected.y }))
      .filter(({ entry, dx, dy }) => allowed.has(entry.node.id) && dx * direction.x + dy * direction.y > 1e-5)
      .map(({ entry, order, dx, dy }) => { const distance = Math.hypot(dx, dy); return { entry, order, distance, alignment: (dx * direction.x + dy * direction.y) / distance }; })
      .sort((a, b) => b.alignment - a.alignment || a.distance - b.distance || a.order - b.order);
    if (!candidates.length) return;
    const cycleKey = `${selected.node.id}:${key}`, cycle = (this.treeCycles.get(cycleKey) ?? 0) % candidates.length;
    this.treeCycles.set(cycleKey, (cycle + 1) % candidates.length);
    const next = candidates[cycle].entry; this.path = next.path; this.selectedId = next.node.id;
    this.setStatus(`${next.node.name} is now the current node.${candidates.length > 1 ? ` Connected choice ${cycle + 1} of ${candidates.length}.` : ""}`);
  }

  private moveFile(key: string): void {
    const entries = flattenTree(this.root), index = entries.findIndex((entry) => entry.node.id === this.selectedId), selected = entries[index];
    if (!selected) return;
    const next = key === "ArrowUp" ? entries[index - 1] : key === "ArrowDown" ? entries[index + 1] : key === "ArrowLeft" ? (selected.parent ? findEntry(this.root, selected.parent.id) : null) : selected.node.children.length ? findEntry(this.root, selected.node.children[0].id) : null;
    if (next) { this.path = next.path; this.select(next.node.id); }
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    const target = event.composedPath()[0];
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || event.ctrlKey || event.metaKey || event.altKey) return;
    if (!this.isConnected) return;
    if (event.key === "?") { event.preventDefault(); this.openHelp(); return; }
    if (event.key.toLowerCase() === "g") { event.preventDefault(); this.chooseView(this.view === "tree" ? "voronoi" : "tree"); return; }
    if (event.key.toLowerCase() === "f") { event.preventDefault(); this.chooseView("file"); return; }
    if (event.key.toLowerCase() === "e") { event.preventDefault(); this.beginEdit(); return; }
    if (this.view === "file") {
      if (event.key === "Tab") { event.preventDefault(); event.shiftKey ? this.outdentFile() : this.indentFile(); }
      else if (event.key === "Enter") { event.preventDefault(); this.beginFileDraft(false); }
      else if (event.key.toLowerCase() === "n") { event.preventDefault(); this.beginFileDraft(true); }
      else if (event.key in directions) { event.preventDefault(); this.moveFile(event.key); }
      else if (event.key === "Delete") { event.preventDefault(); this.deleteFile(); }
      return;
    }
    if (this.view === "tree") {
      if (event.key.toLowerCase() === "n") { event.preventDefault(); this.beginDraft(this.current); }
      else if (event.key in directions) { event.preventDefault(); this.moveTree(event.key); }
      return;
    }
    if (event.key.toLowerCase() === "n") { event.preventDefault(); this.beginDraft(this.current); }
    else if (event.key in directions) { event.preventDefault(); this.moveVoronoi(event.key); }
    else if (event.key === "Enter" && event.shiftKey) { event.preventDefault(); this.goBack(); }
    else if (event.key === "Enter") { event.preventDefault(); this.openSelected(); }
    else if (event.key === "Delete") { event.preventDefault(); this.deleteVoronoi(); }
  };

  private openSelected(): void {
    if (this.selectedId === this.current.id) { this.setStatus(`${this.current.name} is already the current level.`); return; }
    const child = this.current.children.find((node) => node.id === this.selectedId);
    if (child) { this.path = [...this.path, child]; this.selectedId = child.id; this.setStatus(`${child.name} opened.`); }
  }

  private openVoronoiNode(node: OrganizerNode): void {
    if (this.draft) return;
    const entry = findEntry(this.root, node.id);
    if (!entry) return;
    this.path = entry.path; this.selectedId = node.id;
    this.setStatus(`${node.name} opened.`);
  }

  private openVoronoiNodeAndAddChild(node: OrganizerNode): void {
    if (this.draft) return;
    const entry = findEntry(this.root, node.id);
    if (!entry) return;
    this.path = entry.path; this.selectedId = node.id;
    this.beginDraft(node);
  }

  private goBack(): void {
    if (this.path.length === 1) { this.setStatus("Projects is the top level."); return; }
    const leaving = this.current; this.path = this.path.slice(0, -1); this.selectedId = leaving.id; this.setStatus(`Returned to ${this.current.name}.`);
  }

  private chooseTreeNode(entry: LayoutEntry): void { this.path = entry.path; this.selectedId = entry.node.id; this.setStatus(`${entry.node.name} is now the current level.`); }

  private download(): void {
    const blob = new Blob([this.repository.exportJson(this.root)], { type: "application/json" });
    const url = URL.createObjectURL(blob), link = document.createElement("a");
    link.href = url; link.download = "organizer.json"; link.click(); URL.revokeObjectURL(url); this.setStatus("Organizer downloaded as organizer.json.");
  }

  private openHelp(): void { this.renderRoot.querySelector<HTMLDialogElement>("dialog")?.showModal(); }

  private renderVoronoi() {
    const items = visibleItems(this.current), points = circleLayout(items.length);
    const sites = points.map((point, index) => ({ ...point, x: point.x * this.width, y: point.y * this.height, id: items[index].id }));
    const polygons = voronoiPolygons(sites, this.width, this.height);
    return html`<svg viewBox="0 0 ${this.width} ${this.height}" role="img" aria-label="${this.current.name} level">
      <defs>${polygons.map((polygon, index) => svg`<clipPath id=${`edge-cell-${index}`} clipPathUnits="userSpaceOnUse"><path d=${roundedPolygonPath(polygon)}></path></clipPath>`)}</defs>
      ${polygons.map((polygon, index) => {
        const item = items[index], center = polygonCentroid(polygon), selected = item.id === this.selectedId;
        const label = fitLabel(item.name, Math.max(80, Math.sqrt(polygonArea(polygon)) * .7));
        const edges = viewportEdges(polygon, this.width, this.height);
        const edgeSections = edges.map((edge) => ({
          edge,
          band: viewportEdgeBand(polygon, edge, this.width, this.height),
          span: viewportEdgeSpan(polygon, edge, this.width, this.height),
        })).filter(({ band }) => polygonArea(band) >= 1);
        const markerEdge = edgeSections.reduce((longest, section) => section.span > longest.span ? section : longest, edgeSections[0])?.edge;
        const activateEdge = (event: Event) => { event.preventDefault(); event.stopPropagation(); this.openVoronoiNodeAndAddChild(item); };
        return svg`<g class="cell" role="option" aria-selected=${selected} @click=${() => this.select(item.id)} @dblclick=${() => this.openVoronoiNode(item)}>
          <path class="cell-shape" d=${roundedPolygonPath(polygon)} fill=${palette[hashString(item.id) % palette.length]}></path>
          <circle class="dot" cx=${sites[index].x} cy=${sites[index].y} r="3"></circle>
          ${edgeSections.length ? svg`<g class="edge-bands" role="button" tabindex="0" aria-label=${`Open ${item.name} and add a child`} clip-path=${`url(#edge-cell-${index})`} @click=${activateEdge} @dblclick=${(event: Event) => event.stopPropagation()} @keydown=${(event: KeyboardEvent) => { if (event.key === "Enter" || event.key === " ") activateEdge(event); }}>${edgeSections.map(({ edge, band }) => {
            const marker = polygonCentroid(band);
            const points = band.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
            return svg`<polygon class="edge-strip" points=${points}></polygon>${edge === markerEdge ? svg`<text class="add-child-sign" x=${marker.x} y=${marker.y} aria-hidden="true">+</text>` : nothing}`;
          })}</g>` : nothing}
          <path class="cell-outline" d=${roundedPolygonPath(polygon)}></path>
          ${selected ? svg`<path class="selection" d=${roundedPolygonPath(polygon)}></path>` : nothing}
          ${item.id !== this.draft?.id ? svg`<text class="cell-label" x=${center.x} y=${center.y} font-size=${label.size} dy=".35em" @dblclick=${(event: MouseEvent) => { event.stopPropagation(); this.beginEdit(item.id); }}>${label.text}</text>` : nothing}
        </g>`;
      })}
    </svg>${this.renderFloatingEditor(sites, polygons)}`;
  }

  private renderFloatingEditor(sites: Array<Point & { id: string }>, polygons: Point[][]) {
    if (!this.draft || this.view === "file") return nothing;
    const index = sites.findIndex((site) => site.id === this.draft!.id);
    let position: Point | undefined;
    if (this.view === "tree") position = radialTreeLayout(this.root, this.width, this.height).nodes.find((entry) => entry.node.id === this.draft!.id);
    else if (index >= 0) position = polygonCentroid(polygons[index]);
    if (!position) return nothing;
    const editing = this.draft.mode === "edit";
    const value = editing ? findEntry(this.root, this.draft.id)?.node.name ?? "" : "";
    return html`<input data-draft class="editor" style="left:${position.x}px;top:${position.y}px" maxlength="40" aria-label=${editing ? "Edit element name" : "New element name"} .value=${value} @keydown=${this.draftKey} @blur=${(event: FocusEvent) => this.commitDraft(event.currentTarget as HTMLInputElement)} />`;
  }

  private renderTree() {
    const layout = radialTreeLayout(this.root, this.width, this.height);
    return html`<svg viewBox="0 0 ${this.width} ${this.height}" role="img" aria-label="Complete project tree">
      ${layout.links.map(({ source, target }) => svg`<path class="tree-link" fill="none" d=${radialLinkPath(source, target, layout.centerX, layout.centerY, layout.outerRadiusX, layout.outerRadiusY)}></path>`)}
      ${layout.nodes.map((entry) => {
        const current = entry.node.id === this.current.id, selected = entry.node.id === this.selectedId, radius = entry.depth === 0 ? 24 : 19;
        return svg`<g class="tree-node ${current ? "current" : ""}" tabindex="0" role="button" aria-label="${entry.node.name}, level ${entry.depth + 1}" transform="translate(${entry.x} ${entry.y})" @click=${() => this.chooseTreeNode(entry)} @keydown=${(event: KeyboardEvent) => { if (event.key === "Enter" || event.key === " ") this.chooseTreeNode(entry); }}>
          <circle class="core" r=${radius} fill=${palette[hashString(entry.node.id) % palette.length]}></circle>
          ${selected ? svg`<circle r=${radius + 4} fill="none" stroke="var(--ink)" stroke-width="2"></circle>` : nothing}
          <circle class="add-ring" r=${radius + 8} @click=${(event: Event) => { event.stopPropagation(); this.chooseTreeNode(entry); this.beginDraft(entry.node); }}></circle>
          <text y=${entry.depth === 0 ? 39 : 34}>${entry.node.name.length > 22 ? `${entry.node.name.slice(0, 20)}…` : entry.node.name}</text>
        </g>`;
      })}
    </svg>${this.renderFloatingEditor([], [])}`;
  }

  private renderFileTree() {
    return html`<div class="file-tree" role="tree" aria-label="Project file tree">${flattenTree(this.root).map((entry) => html`
      <div class="file-row ${entry.node.id === this.selectedId ? "selected" : ""}" style="--depth:${entry.depth}" role="treeitem" aria-level=${entry.depth + 1} aria-selected=${entry.node.id === this.selectedId} @click=${() => { if (!this.draft) { this.path = entry.path; this.select(entry.node.id); } }}>
        <span class="branch" aria-hidden="true">${entry.node.children.length ? "◆" : "·"}</span>
        ${entry.node.id === this.draft?.id ? html`<input data-draft class="file-editor" maxlength="40" aria-label=${this.draft.mode === "edit" ? "Edit element name" : "New element name"} .value=${this.draft.mode === "edit" ? entry.node.name : ""} @click=${(event: Event) => event.stopPropagation()} @keydown=${this.draftKey} @blur=${(event: FocusEvent) => this.commitDraft(event.currentTarget as HTMLInputElement)} />` : html`<span class="name">${entry.node.name}</span><span class="meta">${entry.node.children.length ? `${entry.node.children.length} child${entry.node.children.length === 1 ? "" : "ren"}` : ""}</span>`}
      </div>`)} </div>`;
  }

  render() {
    return html`<main class="workspace" tabindex="0" role="application" aria-label="Voronoi Organizer">
      <div class="stage ${this.view === "file" ? "file" : ""}">${this.view === "voronoi" ? this.renderVoronoi() : this.view === "tree" ? this.renderTree() : this.renderFileTree()}</div>
      <div class="topbar">
        <nav class="crumbs" aria-label="Current location">${this.path.map((node, index) => html`${index ? html`<span class="separator">/</span>` : nothing}<span>${node.name}</span>`)}</nav>
        <div class="top-actions"><button class="theme-toggle" aria-pressed=${this.theme === "dark"} aria-label=${`Use ${this.theme === "dark" ? "light" : "dark"} mode`} title=${`Use ${this.theme === "dark" ? "light" : "dark"} mode`} @click=${this.toggleTheme}>${this.theme === "dark" ? "Light" : "Dark"}</button><button @click=${this.download}>Export</button><button @click=${this.openHelp}>Help</button><a href="/login">Log in</a></div>
      </div>
      <div class="switcher"><view-switcher .view=${this.view} @view-change=${(event: CustomEvent<OrganizerView>) => this.chooseView(event.detail)}></view-switcher></div>
      <p class="sr-only" aria-live="polite">${this.status}</p>
      <dialog @click=${(event: MouseEvent) => { if (event.target === event.currentTarget) (event.currentTarget as HTMLDialogElement).close(); }}>
        <h2>Keyboard shortcuts</h2>
        <ul><li><kbd>N</kbd> add a child</li><li><kbd>E</kbd> edit the selected node</li><li>Double-click a Voronoi cell to open it; double-click its name to edit it</li><li>Click a highlighted viewport-edge band to open that node and add a child</li><li><kbd>↑ ↓ ← →</kbd> move</li><li><kbd>Enter</kbd> open or add sibling</li><li><kbd>Shift</kbd> + <kbd>Enter</kbd> go back</li><li><kbd>Tab</kbd> / <kbd>Shift</kbd> + <kbd>Tab</kbd> indent / outdent</li><li><kbd>Delete</kbd> remove</li><li><kbd>G</kbd> tree graph · <kbd>F</kbd> file tree</li></ul>
        <button @click=${() => this.renderRoot.querySelector<HTMLDialogElement>("dialog")?.close()}>Close</button>
      </dialog>
    </main>`;
  }
}

declare global { interface HTMLElementTagNameMap { "organizer-app": OrganizerApp } }

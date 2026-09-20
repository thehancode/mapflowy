import { LitElement, css, html, nothing, svg, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import "./view-switcher";
import type { OrganizerLanguage, OrganizerNode, OrganizerWorkspaceDocument, Point, LayoutEntry, OrganizerTheme, TranslationKey, TutorialDocument } from "../../lib/organizer";
import {
  canPlaceSubtreeAtDepth, circleLayout, collectNodeIds, createOnboardingRepository, createRepository, createTutorialDocument, createTutorialRepository, createUserConfigRepository, duplicateMap, ELEMENT_TEXT_LIMIT, emptyWorkspace, findEntry, flattenTree, fitLabel, GRAPH_ROOT_RADIUS, localizeTutorialDocument, MAX_TREE_LEVELS, newNodeId, normalizeElementText,
  polygonArea, polygonBottomBand, polygonCentroid, radialArcPath, radialLinkPath, radialTreeLayout, removeWorkspaceMap, roundedPolygonPath, visibleItems,
  translate, viewportEdgeBand, viewportEdgeOverlayPath, viewportEdges, viewportEdgeSpan, voronoiPathForSelection, voronoiPolygons,
} from "../../lib/organizer";
import type { OrganizerView } from "./view-switcher";

const palette = ["#f38b70", "#efc65d", "#71c1b2", "#88afe0", "#b99bdf", "#df9eb6", "#9fc477", "#e5a665"];
const treeLevelSymbols = ["●", "◆", "■", "▲"] as const;
const treeLevelColors = ["#e45745", "#db8437", "#c2a12f", "#79a944", "#3e9f70", "#329a98", "#4089c7", "#5d70c5", "#8860bd", "#ad5da5", "#c65e7b", "#a46d52"] as const;
type ContextMenuState = { kind: "element" | "map"; id: string; x: number; y: number };
const directions: Record<string, Point> = {
  ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
};
const viewShortcuts: Partial<Record<string, OrganizerView>> = { "1": "voronoi", "2": "tree", "3": "file" };

function hashString(value: string): number {
  let hash = 2166136261;
  for (const character of value) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}

@customElement("organizer-app")
export class OrganizerApp extends LitElement {
  private readonly configRepository = createUserConfigRepository();
  private readonly initialConfig = this.configRepository.load();
  private readonly tutorialRepository = createTutorialRepository();
  private readonly onboardingRepository = createOnboardingRepository();
  @property({ reflect: true }) theme: OrganizerTheme = this.initialConfig.theme;
  @property({ reflect: true }) language: OrganizerLanguage = this.initialConfig.language;
  @state() private workspace: OrganizerWorkspaceDocument = emptyWorkspace();
  @state() private tutorialOpen = true;
  @state() private tutorialDocument: TutorialDocument = createTutorialDocument(this.language);
  @state() private path: OrganizerNode[] = [this.root];
  @state() private selectedId = this.root.id;
  @state() private view: OrganizerView = "tree";
  @state() private status = translate(this.initialConfig.language, "loading");
  @state() private width = 1200;
  @state() private height = 720;
  @state() private draft: { id: string; parentId: string; restoreId: string; mode: "create" | "edit" } | null = null;
  @state() private sidebarOpen = false;
  @state() private depthLimitOpen = false;
  @state() private editingMapId: string | null = null;
  @state() private contextMenu: ContextMenuState | null = null;
  @state() private toast = "";
  @state() private storageSaveFailed = false;
  private readonly repository = createRepository();
  private resizeObserver?: ResizeObserver;
  private treeCycles = new Map<string, number>();
  private toastTimer?: number;

  static styles = css`
    :host { --ink: #171a17; --background: #e8e7de; --file-background: #f4f3ec; --panel: rgba(250,249,244,.88); --panel-border: rgba(23,26,23,.13); --shadow: rgba(23,26,23,.12); --muted: #686a63; --cell-gap: #faf9f4; --edge-overlay-hover: rgba(255,255,255,.18); --row-hover: rgba(255,255,255,.58); --row-selected: #fff; --editor: rgba(255,255,255,.96); --dialog: #faf9f4; --kbd: #fff; display: block; width: 100%; height: 100dvh; min-height: 0; overflow: hidden; color: var(--ink); background: var(--background); color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    :host([theme="dark"]) { --ink: #f2f0e8; --background: #151612; --file-background: #1b1c18; --panel: rgba(35,36,31,.9); --panel-border: rgba(242,240,232,.16); --shadow: rgba(0,0,0,.38); --muted: #aaa99f; --cell-gap: #151612; --edge-overlay-hover: color-mix(in srgb, var(--ink) 14%, transparent); --row-hover: rgba(255,255,255,.06); --row-selected: #292a24; --editor: rgba(38,39,34,.98); --dialog: #23241f; --kbd: #30312b; color-scheme: dark; }
    * { box-sizing: border-box; }
    button, input { font: inherit; }
    .workspace { position: relative; width: 100%; height: 100%; overflow: hidden; outline: none; background: var(--background); }
    .stage { position: absolute; inset: 0; overflow: hidden; }
    .stage.file { overflow: auto; background: var(--file-background); }
    svg { display: block; width: 100%; height: 100%; }
    .topbar { position: absolute; z-index: 10; top: 1rem; left: 1rem; right: 1rem; display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; pointer-events: none; }
    .location-controls { display: flex; flex-direction: column; align-items: flex-start; gap: .65rem; pointer-events: none; }
    .crumbs, .top-actions { pointer-events: auto; border: 1px solid var(--panel-border); background: var(--panel); box-shadow: 0 10px 32px var(--shadow); backdrop-filter: blur(16px); }
    .crumbs { display: flex; flex-wrap: wrap; gap: .42rem; max-width: min(64vw, 760px); padding: .65rem .85rem; border-radius: 14px; font-size: .8rem; font-weight: 740; }
    .crumb { min-width: 0; max-width: min(28vw, 260px); overflow: hidden; padding: 0; border: 0; background: transparent; color: var(--muted); font-weight: 560; cursor: pointer; text-overflow: ellipsis; white-space: nowrap; }
    .crumb[aria-current="location"] { color: var(--ink); font-weight: 740; }
    .crumb:hover { color: var(--ink); text-decoration: underline; text-underline-offset: 3px; }
    .separator { opacity: .45; }
    .top-actions { display: flex; gap: .25rem; padding: .25rem; border-radius: 999px; }
    .top-actions a, .top-actions button { min-height: 2.25rem; display: inline-flex; align-items: center; padding: 0 .78rem; border: 0; border-radius: 999px; background: transparent; color: var(--ink); text-decoration: none; font-size: .75rem; font-weight: 750; cursor: pointer; }
    .top-actions a { background: var(--ink); color: var(--background); }
    .icon-button { width: 2.25rem; justify-content: center; padding: 0 !important; }
    .language-toggle { min-width: 2.5rem; justify-content: center; padding: 0 .55rem !important; }
    .icon-button svg, .context-toolbar svg, .sidebar-toggle svg, .back-button svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; pointer-events: none; }
    .switcher { position: absolute; z-index: 10; top: 1rem; left: 50%; transform: translateX(-50%); }
    .left-actions { position: absolute; z-index: 12; left: 1rem; bottom: 1rem; display: flex; flex-direction: column; align-items: flex-start; gap: .45rem; }
    .sidebar-toggle { display: grid; place-items: center; width: 2.25rem; height: 2.25rem; border: 1px solid var(--panel-border); border-radius: 50%; background: var(--panel); color: var(--ink); box-shadow: 0 8px 24px var(--shadow); backdrop-filter: blur(16px); cursor: pointer; }
    .quick-actions { display: flex; flex-direction: column; align-items: flex-start; gap: .45rem; }
    .quick-action-button { display: inline-flex; align-items: center; gap: .55rem; min-height: 2rem; padding: .42rem .7rem; border: 1px solid var(--panel-border); border-radius: 999px; background: var(--panel); color: var(--muted); box-shadow: 0 8px 24px var(--shadow); backdrop-filter: blur(16px); font-size: .72rem; font-weight: 700; cursor: pointer; }
    .quick-action-button kbd { color: var(--ink); }
    .quick-action-button:hover { background: var(--row-hover); }
    .back-button { display: grid; place-items: center; width: 2.75rem; height: 2.75rem; border: 1px solid var(--panel-border); border-radius: 50%; background: var(--panel); color: var(--ink); box-shadow: 0 10px 32px var(--shadow); backdrop-filter: blur(16px); pointer-events: auto; cursor: pointer; }
    .map-sidebar { position: absolute; z-index: 11; left: 1rem; bottom: 8.75rem; display: flex; flex-direction: column; width: min(310px, calc(100vw - 2rem)); max-height: 50dvh; overflow: hidden; border: 1px solid var(--panel-border); border-radius: 18px; background: var(--panel); box-shadow: 0 18px 52px var(--shadow); backdrop-filter: blur(18px); }
    .map-sidebar h2 { margin: 0; padding: 1rem 1rem .55rem; font-size: .82rem; }
    .map-list { min-height: 0; overflow-y: auto; padding: .2rem .55rem .65rem; }
    .map-row { display: flex; align-items: center; width: 100%; min-height: 42px; padding: .35rem .55rem; border: 1px solid transparent; border-radius: 10px; background: transparent; color: var(--ink); cursor: pointer; }
    .map-row:hover { background: var(--row-hover); }
    .map-row.active { border-color: var(--panel-border); background: var(--row-selected); }
    .map-row-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .82rem; font-weight: 720; }
    .map-name-input { width: 100%; min-height: 32px; padding: 0 .5rem; border: 1px solid var(--panel-border); border-radius: 7px; background: var(--editor); color: var(--ink); outline: 0; font-weight: 700; }
    .context-toolbar { position: fixed; z-index: 40; display: flex; gap: .2rem; padding: .3rem; border: 1px solid var(--panel-border); border-radius: 999px; background: var(--panel); color: var(--ink); box-shadow: 0 14px 40px var(--shadow); backdrop-filter: blur(18px); }
    .context-toolbar button { display: grid; place-items: center; width: 2.35rem; height: 2.35rem; padding: 0; border: 0; border-radius: 50%; background: transparent; color: inherit; cursor: pointer; }
    .context-toolbar button:hover { background: var(--row-hover); }
    .cell { cursor: default; }
    .cell-shape { transition: filter .14s ease; }
    .cell:hover .cell-shape { filter: brightness(.97) saturate(1.05); }
    .cell-outline { fill: none; stroke: var(--cell-gap); stroke-width: 12; stroke-linejoin: round; vector-effect: non-scaling-stroke; pointer-events: none; }
    .cell-label { fill: var(--ink); font-weight: 760; text-anchor: middle; cursor: text; user-select: none; paint-order: stroke; stroke: var(--cell-gap); stroke-width: 3px; stroke-linejoin: round; }
    .selection { fill: none; stroke: var(--ink); stroke-width: 20; stroke-linejoin: round; vector-effect: non-scaling-stroke; pointer-events: none; }
    .edge-bands { cursor: cell; outline: none; }
    .edge-strip { fill: transparent; stroke: none; transition: fill .14s ease; }
    .edge-bands:hover .edge-strip, .edge-bands:focus-visible .edge-strip { fill: var(--edge-overlay-hover); }
    .add-child-sign { fill: #fff; font: 700 28px system-ui, sans-serif; text-anchor: middle; dominant-baseline: central; pointer-events: none; user-select: none; }
    :host([theme="dark"]) .add-child-sign { fill: var(--ink); }
    .tree-link { stroke: color-mix(in srgb, var(--ink) 25%, transparent); stroke-width: 2; vector-effect: non-scaling-stroke; }
    .tree-node { cursor: pointer; outline: none; }
    .tree-node .core { stroke: var(--cell-gap); stroke-width: 4; vector-effect: non-scaling-stroke; }
    .tree-node.current .core { stroke: var(--ink); stroke-width: 5; }
    .tree-node text { fill: var(--ink); font-size: 12px; font-weight: 750; text-anchor: middle; paint-order: stroke; stroke: var(--background); stroke-width: 3px; cursor: text; user-select: none; }
    .add-ring { fill: none; stroke: var(--ink); stroke-width: 8; stroke-linecap: round; opacity: .12; cursor: crosshair; vector-effect: non-scaling-stroke; }
    .add-ring:hover { opacity: .65; }
    .file-tree { min-height: 100%; padding: 5.6rem 1.1rem 5.5rem; }
    .file-row { display: flex; align-items: center; min-height: 44px; margin-left: calc(var(--depth) * 28px); padding: .35rem .65rem; border: 1px solid transparent; border-radius: 9px; cursor: pointer; }
    .file-row:hover { background: var(--row-hover); }
    .file-row.selected { border-color: var(--panel-border); background: var(--row-selected); box-shadow: 0 3px 12px var(--shadow); }
    .branch { flex: 0 0 20px; width: 20px; font-size: .78rem; line-height: 1; text-align: center; }
    .name { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .9rem; font-weight: 680; }
    .file-row.selected .name { overflow: visible; overflow-wrap: anywhere; text-overflow: clip; white-space: pre-wrap; }
    .meta { flex: 0 0 auto; margin-left: auto; padding-left: 1rem; color: var(--muted); font-size: .7rem; }
    .editor { position: absolute; z-index: 20; width: min(280px, 70vw); height: 44px; padding: 0 .75rem; border: 2px solid var(--ink); border-radius: 10px; outline: 0; background: var(--editor); color: var(--ink); font-weight: 700; text-align: center; box-shadow: 0 7px 24px var(--shadow); transform: translate(-50%, -50%); }
    .file-editor { width: min(360px, calc(100% - 30px)); height: 32px; padding: 0 .55rem; border: 2px solid var(--ink); border-radius: 6px; outline: 0; background: var(--editor); color: var(--ink); font-weight: 700; }
    .toast { position: fixed; z-index: 60; left: 50%; bottom: 1.25rem; max-width: calc(100vw - 2rem); padding: .7rem 1rem; border: 1px solid var(--panel-border); border-radius: 999px; background: var(--ink); color: var(--background); box-shadow: 0 12px 36px var(--shadow); font-size: .82rem; font-weight: 750; transform: translateX(-50%); }
    .toast.raised { bottom: 6rem; }
    .shortcut-hints { position: absolute; z-index: 9; right: 1rem; bottom: 1rem; display: flex; flex-direction: column; align-items: flex-end; gap: .45rem; pointer-events: none; }
    .shortcut-hint { display: flex; align-items: center; gap: .55rem; min-height: 2rem; padding: .42rem .7rem; border: 1px solid var(--panel-border); border-radius: 999px; background: var(--panel); color: var(--muted); box-shadow: 0 8px 24px var(--shadow); backdrop-filter: blur(16px); font-size: .72rem; font-weight: 700; }
    .shortcut-key-group { display: inline-flex; align-items: center; gap: .25rem; color: var(--ink); white-space: nowrap; }
    .modal-backdrop { position: fixed; z-index: 70; inset: 0; display: grid; place-items: center; padding: 1rem; background: rgba(23,26,23,.38); backdrop-filter: blur(4px); }
    .depth-limit-modal { width: min(430px, 100%); padding: 1.25rem; border: 1px solid var(--panel-border); border-radius: 18px; outline: 0; background: var(--dialog); color: var(--ink); box-shadow: 0 30px 90px var(--shadow); }
    .depth-limit-modal h2 { margin: 0 0 .65rem; font-size: 1.05rem; }
    .depth-limit-modal p { margin: 0; color: var(--muted); line-height: 1.55; }
    .depth-limit-modal button { display: block; min-height: 2.5rem; margin: 1rem 0 0 auto; padding: 0 1rem; border: 0; border-radius: 9px; background: var(--ink); color: var(--background); font-weight: 750; cursor: pointer; }
    .save-error { position: fixed; z-index: 55; left: 50%; bottom: 1rem; width: min(560px, calc(100vw - 2rem)); padding: .8rem 1rem; border: 1px solid #8f2f21; border-radius: 12px; background: #fff1ed; color: #702317; box-shadow: 0 12px 36px var(--shadow); font-size: .8rem; font-weight: 720; line-height: 1.4; text-align: center; transform: translateX(-50%); }
    :host([theme="dark"]) .save-error { border-color: #e7806d; background: #3a201b; color: #ffd9d1; }
    kbd { padding: .15rem .38rem; border: 1px solid var(--panel-border); border-bottom-width: 2px; border-radius: 5px; background: var(--kbd); font: 700 .72rem system-ui; }
    .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
    :focus-visible { outline: 2px solid #eb4d28; outline-offset: 2px; }
    @media (max-width: 600px) {
      .topbar { top: .65rem; left: .65rem; right: .65rem; }
      .switcher { top: 4.15rem; }
      .crumbs { max-width: calc(100vw - 11.5rem); }
      .left-actions { left: .65rem; bottom: .65rem; }
      .shortcut-hints { right: .65rem; bottom: .65rem; }
      .shortcut-hint { max-width: calc(100vw - 1.3rem); }
      .map-sidebar { left: .65rem; bottom: 8.4rem; width: min(310px, calc(100vw - 1.3rem)); }
      .file-tree { padding-top: 8.2rem; }
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
    if (this.toastTimer) window.clearTimeout(this.toastTimer);
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
    if (changed.has("editingMapId") && this.editingMapId) requestAnimationFrame(() => {
      const input = this.renderRoot.querySelector<HTMLInputElement>("[data-map-edit]");
      input?.focus(); input?.select();
    });
    if (changed.has("contextMenu") && this.contextMenu) requestAnimationFrame(() => {
      this.renderRoot.querySelector<HTMLButtonElement>(".context-toolbar button")?.focus();
    });
    if (changed.has("depthLimitOpen") && this.depthLimitOpen) requestAnimationFrame(() => {
      this.renderRoot.querySelector<HTMLButtonElement>(".depth-limit-modal button")?.focus();
    });
  }

  private get root(): OrganizerNode { return this.tutorialOpen ? this.tutorialDocument.root : this.workspace.maps.find(({ id }) => id === this.workspace.activeMapId) ?? this.workspace.maps[0] ?? this.tutorialDocument.root; }
  private get current(): OrganizerNode { return this.path[this.path.length - 1]; }
  private t(key: TranslationKey, values: Record<string, string | number> = {}): string { return translate(this.language, key, values); }
  private setStatus(message: string): void { this.status = message; }

  private showDepthLimit(): void {
    this.contextMenu = null;
    this.depthLimitOpen = true;
  }

  private showToast(message: string): void {
    this.toast = message;
    if (this.toastTimer) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => { this.toast = ""; }, 2200);
  }

  private toggleTheme(): void {
    this.theme = this.theme === "dark" ? "light" : "dark";
    this.configRepository.save({ version: 2, theme: this.theme, language: this.language });
    this.setStatus(this.t(this.theme === "dark" ? "darkEnabled" : "lightEnabled"));
  }

  private setLanguage(language: OrganizerLanguage): void {
    if (language === this.language) return;
    this.language = language;
    this.tutorialDocument = localizeTutorialDocument(this.tutorialDocument, language);
    if (this.tutorialOpen) {
      this.path = findEntry(this.tutorialDocument.root, this.selectedId)?.path ?? [this.tutorialDocument.root];
    }
    this.storageSaveFailed = !this.tutorialRepository.save(this.tutorialDocument);
    this.toast = "";
    this.configRepository.save({ version: 2, theme: this.theme, language });
    this.setStatus(translate(language, language === "es" ? "languageSpanishEnabled" : "languageEnglishEnabled"));
  }

  private async load(): Promise<void> {
    const firstVisit = this.onboardingRepository.isFirstVisit();
    this.workspace = await this.repository.load();
    this.tutorialDocument = this.tutorialRepository.load(this.language);
    this.tutorialOpen = firstVisit || this.workspace.maps.length === 0;
    this.sidebarOpen = firstVisit;
    if (firstVisit) this.onboardingRepository.markSeen();
    this.path = [this.root]; this.selectedId = this.root.id; this.treeCycles.clear();
    this.setStatus(this.t("loaded", { name: this.root.name }));
  }

  private persist(): void {
    const saved = this.tutorialOpen ? this.tutorialRepository.save(this.tutorialDocument) : this.repository.save(this.workspace);
    this.storageSaveFailed = !saved;
    this.requestUpdate();
  }

  private persistMaps(): void {
    this.storageSaveFailed = !this.repository.save(this.workspace);
    this.requestUpdate();
  }

  private resetToRoot(message: string): void {
    this.path = [this.root]; this.selectedId = this.root.id; this.draft = null; this.contextMenu = null; this.treeCycles.clear();
    this.setStatus(message);
  }

  private switchMap(id: string): void {
    if (this.draft) this.cancelDraft();
    if (this.tutorialOpen) this.tutorialOpen = false;
    if (id === this.workspace.activeMapId) { this.resetToRoot(this.t("opened", { name: this.root.name })); return; }
    const map = this.workspace.maps.find((candidate) => candidate.id === id);
    if (!map) return;
    this.workspace = { ...this.workspace, activeMapId: id };
    this.editingMapId = null;
    this.resetToRoot(this.t("opened", { name: map.name }));
    this.persist();
  }

  private createMap(): void {
    if (this.draft) this.cancelDraft();
    this.tutorialOpen = false;
    const id = newNodeId(collectNodeIds(this.workspace.maps));
    const map: OrganizerNode = { id, name: this.t("untitledMap"), children: [] };
    this.workspace = { version: 3, activeMapId: id, maps: [...this.workspace.maps, map] };
    this.sidebarOpen = true; this.editingMapId = id;
    this.resetToRoot(this.t("newMapReady"));
    this.persist();
  }

  private openTutorial(): void {
    if (this.draft) this.cancelDraft();
    this.tutorialOpen = true;
    this.editingMapId = null;
    this.resetToRoot(this.t("tutorialOpened"));
  }

  private beginMapRename(id: string): void {
    this.contextMenu = null; this.sidebarOpen = true; this.editingMapId = id;
  }

  private commitMapRename(input: HTMLInputElement, id: string): void {
    if (this.editingMapId !== id) return;
    const map = this.workspace.maps.find((candidate) => candidate.id === id);
    if (!map) { this.editingMapId = null; return; }
    const name = normalizeElementText(input.value, "");
    if (name) map.name = name;
    this.editingMapId = null; this.persistMaps(); this.setStatus(this.t("renamed", { name: map.name }));
  }

  private mapRenameKey(event: KeyboardEvent, id: string): void {
    event.stopPropagation();
    if (event.key === "Enter") { event.preventDefault(); this.commitMapRename(event.currentTarget as HTMLInputElement, id); }
    if (event.key === "Escape") { event.preventDefault(); this.editingMapId = null; }
  }

  private duplicateWorkspaceMap(id: string): void {
    const index = this.workspace.maps.findIndex((map) => map.id === id);
    if (index < 0) return;
    const duplicate = duplicateMap(this.workspace.maps[index], this.workspace.maps);
    const maps = [...this.workspace.maps]; maps.splice(index + 1, 0, duplicate);
    this.workspace = { version: 3, activeMapId: duplicate.id, maps };
    this.tutorialOpen = false;
    this.editingMapId = null; this.resetToRoot(this.t("created", { name: duplicate.name })); this.persist();
  }

  private deleteWorkspaceMap(id: string): void {
    const map = this.workspace.maps.find((candidate) => candidate.id === id);
    if (!map) return;
    const wasVisible = !this.tutorialOpen && this.workspace.activeMapId === id;
    this.workspace = removeWorkspaceMap(this.workspace, id);
    this.contextMenu = null;
    if (this.editingMapId === id) this.editingMapId = null;
    if (wasVisible) {
      this.tutorialOpen = this.workspace.maps.length === 0;
      this.resetToRoot(this.t("deletedMap", { name: map.name }));
    } else {
      this.setStatus(this.t("deletedMap", { name: map.name }));
    }
    this.persistMaps();
  }

  private downloadMap(root: OrganizerNode): void {
    const blob = new Blob([this.repository.exportMapJson(root)], { type: "application/json" });
    const url = URL.createObjectURL(blob), link = document.createElement("a");
    const filename = root.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "mapflowy-map";
    link.href = url; link.download = `${filename}.json`; link.click(); URL.revokeObjectURL(url);
    this.contextMenu = null; this.setStatus(this.t("exported", { name: root.name }));
  }

  private async copyElementName(id: string): Promise<void> {
    const node = findEntry(this.root, id)?.node;
    this.contextMenu = null;
    if (!node) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(node.name);
      this.setStatus(this.t("copied"));
      this.showToast(this.t("copiedToast"));
    } catch {
      this.setStatus(this.t("copyFailed"));
      this.showToast(this.t("copyFailedToast"));
    }
  }

  private deleteElement(id: string): void {
    const entry = findEntry(this.root, id);
    this.contextMenu = null;
    if (!entry?.parent) { this.setStatus(this.t("removeRoot")); return; }
    const name = entry.node.name;
    entry.parent.children = entry.parent.children.filter((node) => node.id !== id);
    const parent = findEntry(this.root, entry.parent.id)!;
    this.path = parent.path; this.selectedId = parent.node.id; this.treeCycles.clear(); this.persist();
    this.setStatus(this.t("removed", { name }));
  }

  private contextPosition(x: number, y: number): Pick<ContextMenuState, "x" | "y"> {
    const menuWidth = 190, menuHeight = 48, margin = 8;
    return { x: Math.max(margin, Math.min(x, window.innerWidth - menuWidth - margin)), y: Math.max(margin, Math.min(y, window.innerHeight - menuHeight - margin)) };
  }

  private openContextMenu(event: MouseEvent, kind: ContextMenuState["kind"], id: string): void {
    event.preventDefault(); event.stopPropagation();
    if (this.draft) return;
    if (kind === "element") this.selectedId = id;
    this.contextMenu = { kind, id, ...this.contextPosition(event.clientX, event.clientY) };
  }

  private openKeyboardElementMenu(): void {
    const target = Array.from(this.renderRoot.querySelectorAll<HTMLElement>("[data-node-id]")).find((element) => element.dataset.nodeId === this.selectedId);
    const bounds = target?.getBoundingClientRect();
    const x = bounds ? bounds.left + bounds.width / 2 : window.innerWidth / 2;
    const y = bounds ? bounds.top + bounds.height / 2 : window.innerHeight / 2;
    this.contextMenu = { kind: "element", id: this.selectedId, ...this.contextPosition(x, y) };
  }

  private mapRowKey(event: KeyboardEvent, id: string): void {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); this.switchMap(id); return; }
    if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
    event.preventDefault(); event.stopPropagation();
    const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.contextMenu = { kind: "map", id, ...this.contextPosition(bounds.right, bounds.top + bounds.height / 2) };
  }

  private workspacePointerDown(event: PointerEvent): void {
    const path = event.composedPath();
    const includesClass = (...classNames: string[]) => path.some((target) => target instanceof Element && classNames.some((className) => target.classList.contains(className)));
    if (this.contextMenu && !includesClass("context-toolbar")) this.contextMenu = null;
    if (this.sidebarOpen && !includesClass("map-sidebar", "sidebar-toggle")) this.sidebarOpen = false;
  }

  private select(id: string): void { const name = findEntry(this.root, id)?.node.name ?? this.t("element"); this.selectedId = id; this.setStatus(this.t("elementSelected", { name })); }

  private chooseView(view: OrganizerView): void {
    if (this.draft) this.cancelDraft();
    this.contextMenu = null;
    if (view === "voronoi" && this.view !== "voronoi") {
      this.path = voronoiPathForSelection(this.root, this.selectedId);
    }
    this.view = view;
    this.setStatus(view === "tree" ? this.t("completeGraphView") : view === "file" ? this.t("treeViewReady") : this.t("currentLevel", { name: this.current.name }));
    this.renderRoot.querySelector<HTMLElement>(".workspace")?.focus();
  }

  private beginDraft(parent: OrganizerNode, restoreId = parent.id, insertionIndex = parent.children.length): void {
    if (this.draft) return;
    const parentEntry = findEntry(this.root, parent.id);
    if (!parentEntry) return;
    if (parentEntry.depth + 2 > MAX_TREE_LEVELS) { this.showDepthLimit(); return; }
    const item = { id: newNodeId(flattenTree(this.root).map(({ node }) => node.id)), name: "", children: [] };
    parent.children.splice(insertionIndex, 0, item);
    this.draft = { id: item.id, parentId: parent.id, restoreId, mode: "create" };
    this.selectedId = item.id; this.treeCycles.clear(); this.requestUpdate();
    this.setStatus(this.t("newElementReady"));
  }

  private addChildToSelected(): void {
    if (this.draft) return;
    const selected = findEntry(this.root, this.selectedId) ?? findEntry(this.root, this.root.id);
    if (!selected) return;
    this.contextMenu = null;
    if (this.view === "voronoi") this.path = selected.path;
    this.beginDraft(selected.node);
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
    this.setStatus(this.t("editing", { name: selected.node.name }));
  }

  private commitDraft(input: HTMLInputElement): void {
    if (!this.draft) return;
    const name = normalizeElementText(input.value, "");
    if (!name) { this.cancelDraft(); return; }
    const item = findEntry(this.root, this.draft.id)?.node;
    if (!item) { this.cancelDraft(); return; }
    const { mode, parentId } = this.draft;
    item.name = name; const id = item.id; this.draft = null;
    if (this.tutorialOpen) {
      this.tutorialDocument = { ...this.tutorialDocument, customTextIds: [...new Set([...this.tutorialDocument.customTextIds, id])] };
    }
    const entry = findEntry(this.root, mode === "create" ? parentId : id)!;
    this.selectedId = entry.node.id;
    if (this.view !== "voronoi") this.path = entry.path;
    this.persist(); this.setStatus(this.t(mode === "edit" ? "renamed" : "created", { name }));
  }

  private cancelDraft(): void {
    if (!this.draft) return;
    const { id, parentId, restoreId, mode } = this.draft;
    if (mode === "edit") {
      this.draft = null; this.requestUpdate(); this.setStatus(this.t("editCancelled")); return;
    }
    const parent = findEntry(this.root, parentId)?.node;
    if (parent) parent.children = parent.children.filter((child) => child.id !== id);
    this.draft = null; const restored = findEntry(this.root, restoreId) ?? findEntry(this.root, parentId)!;
    this.path = restored.path; this.selectedId = restored.node.id; this.requestUpdate(); this.setStatus(this.t("newElementCancelled"));
  }

  private draftKey(event: KeyboardEvent): void {
    event.stopPropagation();
    if (event.key === "Enter") { event.preventDefault(); this.commitDraft(event.currentTarget as HTMLInputElement); }
    if (event.key === "Escape") { event.preventDefault(); this.cancelDraft(); }
  }

  private indentFile(): void {
    const selected = findEntry(this.root, this.selectedId);
    if (!selected?.parent || selected.index <= 0) { this.setStatus(this.t("noPreviousSibling")); return; }
    if (!canPlaceSubtreeAtDepth(selected.node, selected.depth + 1)) { this.showDepthLimit(); return; }
    const siblings = selected.parent.children; const newParent = siblings[selected.index - 1];
    siblings.splice(selected.index, 1); newParent.children.push(selected.node);
    this.path = findEntry(this.root, selected.node.id)!.path; this.treeCycles.clear(); this.persist();
    this.setStatus(this.t("nowChildOf", { name: selected.node.name, parent: newParent.name }));
  }

  private outdentFile(): void {
    const selected = findEntry(this.root, this.selectedId);
    if (!selected?.parent) { this.setStatus(this.t("rootCannotMove")); return; }
    const parentEntry = findEntry(this.root, selected.parent.id);
    if (!parentEntry?.parent) { this.setStatus(this.t("alreadyFirstLevel", { name: selected.node.name })); return; }
    selected.parent.children.splice(selected.index, 1);
    const parentIndex = parentEntry.parent.children.findIndex((node) => node.id === parentEntry.node.id);
    parentEntry.parent.children.splice(parentIndex + 1, 0, selected.node);
    this.path = findEntry(this.root, selected.node.id)!.path; this.treeCycles.clear(); this.persist();
    this.setStatus(this.t("movedUp", { name: selected.node.name }));
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
    this.setStatus(this.t("currentNode", { name: next.node.name }) + (candidates.length > 1 ? this.t("connectedChoice", { current: cycle + 1, total: candidates.length }) : ""));
  }

  private moveFile(key: string): void {
    const entries = flattenTree(this.root), index = entries.findIndex((entry) => entry.node.id === this.selectedId), selected = entries[index];
    if (!selected) return;
    const next = key === "ArrowUp" ? entries[index - 1] : key === "ArrowDown" ? entries[index + 1] : key === "ArrowLeft" ? (selected.parent ? findEntry(this.root, selected.parent.id) : null) : selected.node.children.length ? findEntry(this.root, selected.node.children[0].id) : null;
    if (next) { this.path = next.path; this.select(next.node.id); }
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    const target = event.composedPath()[0];
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
    if (!this.isConnected) return;
    if (this.depthLimitOpen) {
      if (event.key === "Escape") { event.preventDefault(); this.depthLimitOpen = false; }
      return;
    }
    if (event.key === "Escape" && this.contextMenu) { event.preventDefault(); this.contextMenu = null; return; }
    if (event.key === "Escape" && this.sidebarOpen) { event.preventDefault(); this.sidebarOpen = false; return; }
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) { event.preventDefault(); this.openKeyboardElementMenu(); return; }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const shortcutView = viewShortcuts[event.key];
    if (shortcutView) { event.preventDefault(); this.chooseView(shortcutView); return; }
    if (event.key.toLowerCase() === "n") { event.preventDefault(); this.createMap(); return; }
    if (event.key.toLowerCase() === "e") { event.preventDefault(); this.beginEdit(); return; }
    if (this.view === "file") {
      if (event.key === "Tab") { event.preventDefault(); event.shiftKey ? this.outdentFile() : this.indentFile(); }
      else if (event.key === "Enter") { event.preventDefault(); this.beginFileDraft(false); }
      else if (event.key.toLowerCase() === "a") { event.preventDefault(); this.beginFileDraft(true); }
      else if (event.key in directions) { event.preventDefault(); this.moveFile(event.key); }
      return;
    }
    if (this.view === "tree") {
      if (event.key.toLowerCase() === "a") { event.preventDefault(); this.beginDraft(this.current); }
      else if (event.key in directions) { event.preventDefault(); this.moveTree(event.key); }
      return;
    }
    if (event.key.toLowerCase() === "a") { event.preventDefault(); this.beginDraft(this.current); }
    else if (event.key in directions) { event.preventDefault(); this.moveVoronoi(event.key); }
    else if (event.key === "Enter" && event.shiftKey) { event.preventDefault(); this.goBack(); }
    else if (event.key === "Enter") { event.preventDefault(); this.openSelected(); }
  };

  private openSelected(): void {
    if (this.selectedId === this.current.id) { this.setStatus(this.t("alreadyCurrent", { name: this.current.name })); return; }
    const child = this.current.children.find((node) => node.id === this.selectedId);
    if (child) { this.path = [...this.path, child]; this.selectedId = child.id; this.setStatus(this.t("opened", { name: child.name })); }
  }

  private openVoronoiNode(node: OrganizerNode): void {
    if (this.draft) return;
    const entry = findEntry(this.root, node.id);
    if (!entry) return;
    this.path = entry.path; this.selectedId = node.id;
    this.setStatus(this.t("opened", { name: node.name }));
  }

  private openVoronoiNodeAndAddChild(node: OrganizerNode): void {
    if (this.draft) return;
    const entry = findEntry(this.root, node.id);
    if (!entry) return;
    this.path = entry.path; this.selectedId = node.id;
    this.beginDraft(node);
  }

  private goBack(): void {
    if (this.path.length === 1) { this.setStatus(this.t("topLevel", { name: this.root.name })); return; }
    const leaving = this.current; this.path = this.path.slice(0, -1); this.selectedId = leaving.id; this.setStatus(this.t("returnedTo", { name: this.current.name }));
  }

  private chooseBreadcrumb(node: OrganizerNode, index: number): void {
    if (this.draft) this.cancelDraft();
    this.contextMenu = null;
    if (this.view === "voronoi") {
      this.path = this.path.slice(0, index + 1); this.selectedId = node.id;
      this.setStatus(this.t("opened", { name: node.name }));
      return;
    }
    this.selectedId = node.id; this.setStatus(this.t("elementSelected", { name: node.name }));
    requestAnimationFrame(() => {
      const target = Array.from(this.renderRoot.querySelectorAll<HTMLElement>("[data-node-id]")).find((element) => element.dataset.nodeId === node.id);
      target?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  }

  private chooseTreeNode(entry: LayoutEntry): void { this.path = entry.path; this.selectedId = entry.node.id; this.setStatus(this.t("nowCurrentLevel", { name: entry.node.name })); }

  private renderVoronoi() {
    const items = visibleItems(this.current), points = circleLayout(items.length);
    const sites = points.map((point, index) => ({ ...point, x: point.x * this.width, y: point.y * this.height, id: items[index].id }));
    const polygons = voronoiPolygons(sites, this.width, this.height);
    return html`<svg viewBox="0 0 ${this.width} ${this.height}" role="img" aria-label=${this.t("voronoiLevel", { name: this.current.name })}>
      <defs>${polygons.map((polygon, index) => svg`<clipPath id=${`edge-cell-${index}`} clipPathUnits="userSpaceOnUse"><path d=${roundedPolygonPath(polygon)}></path></clipPath>`)}</defs>
      ${polygons.map((polygon, index) => {
        const item = items[index], center = polygonCentroid(polygon), selected = item.id === this.selectedId;
        const label = fitLabel(item.name, Math.max(80, Math.sqrt(polygonArea(polygon)) * .7));
        const isParent = item.id === this.current.id;
        const edges = viewportEdges(polygon, this.width, this.height);
        const edgeSections = isParent ? [] : edges.map((edge) => ({
          edge,
          band: viewportEdgeBand(polygon, edge, this.width, this.height),
          span: viewportEdgeSpan(polygon, edge, this.width, this.height),
        })).filter(({ band }) => polygonArea(band) >= 1);
        const markerSection = edgeSections.length ? edgeSections.reduce((longest, section) => section.span > longest.span ? section : longest) : undefined;
        const parentBand = isParent ? polygonBottomBand(polygon) : [];
        const addSectionPath = isParent ? roundedPolygonPath(parentBand, 0) : viewportEdgeOverlayPath(polygon, edges, this.width, this.height);
        const markerBand = isParent ? parentBand : markerSection?.band;
        const activateEdge = (event: Event) => { event.preventDefault(); event.stopPropagation(); this.openVoronoiNodeAndAddChild(item); };
        return svg`<g class="cell" data-node-id=${item.id} role="option" aria-selected=${selected} @click=${() => this.select(item.id)} @dblclick=${() => { if (isParent) this.goBack(); else this.openVoronoiNode(item); }} @contextmenu=${(event: MouseEvent) => this.openContextMenu(event, "element", item.id)}>
          <path class="cell-shape" d=${roundedPolygonPath(polygon)} fill=${palette[hashString(item.id) % palette.length]}></path>
          ${markerBand && polygonArea(markerBand) >= 1 ? svg`<g class="edge-bands" role="button" tabindex="0" aria-label=${this.t("openAndAddChild", { name: item.name })} clip-path=${`url(#edge-cell-${index})`} @click=${activateEdge} @dblclick=${(event: Event) => event.stopPropagation()} @keydown=${(event: KeyboardEvent) => { if (event.key === "Enter" || event.key === " ") activateEdge(event); }}><path class="edge-strip" fill-rule="evenodd" d=${addSectionPath}></path>${(() => {
            const marker = polygonCentroid(markerBand);
            return svg`<text class="add-child-sign" x=${marker.x} y=${marker.y} aria-hidden="true">+</text>`;
          })()}</g>` : nothing}
          ${selected ? svg`<path class="selection" d=${roundedPolygonPath(polygon)} clip-path=${`url(#edge-cell-${index})`}></path>` : nothing}
          <path class="cell-outline" d=${roundedPolygonPath(polygon)}></path>
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
    return html`<input data-draft class="editor" style="left:${position.x}px;top:${position.y}px" maxlength=${ELEMENT_TEXT_LIMIT} aria-label=${this.t(editing ? "editorEdit" : "editorNew")} .value=${value} @keydown=${this.draftKey} @blur=${(event: FocusEvent) => this.commitDraft(event.currentTarget as HTMLInputElement)} />`;
  }

  private renderTree() {
    const layout = radialTreeLayout(this.root, this.width, this.height);
    return html`<svg viewBox="0 0 ${this.width} ${this.height}" role="img" aria-label=${this.t("completeProjectGraph")}>
      ${layout.links.map(({ source, target }) => svg`<path class="tree-link" fill="none" d=${radialLinkPath(source, target, layout.centerX, layout.centerY, layout.outerRadiusX, layout.outerRadiusY)}></path>`)}
      ${layout.nodes.map((entry) => {
        const current = entry.node.id === this.current.id, selected = entry.node.id === this.selectedId, radius = entry.depth === 0 ? GRAPH_ROOT_RADIUS : 19;
        return svg`<g class="tree-node ${current ? "current" : ""}" data-node-id=${entry.node.id} tabindex="0" role="button" aria-label=${this.t("nodeLevel", { name: entry.node.name, level: entry.depth + 1 })} transform="translate(${entry.x} ${entry.y})" @click=${() => this.chooseTreeNode(entry)} @contextmenu=${(event: MouseEvent) => this.openContextMenu(event, "element", entry.node.id)} @keydown=${(event: KeyboardEvent) => { if (event.key === "Enter" || event.key === " ") this.chooseTreeNode(entry); }}>
          <title>${entry.node.name}</title>
          <circle class="core" r=${radius} fill=${palette[hashString(entry.node.id) % palette.length]}></circle>
          ${selected ? svg`<circle r=${radius + 4} fill="none" stroke="var(--ink)" stroke-width="2"></circle>` : nothing}
          ${svg`<path class="add-ring" d=${radialArcPath(radius + 8, 225, -45, true)} aria-label=${this.t("addChildren")} @click=${(event: Event) => { event.stopPropagation(); this.chooseTreeNode(entry); this.beginDraft(entry.node); }}><title>${this.t("addChildren")}</title></path>`}
          <text y=${entry.depth === 0 ? 39 : 34} @click=${(event: MouseEvent) => { event.stopPropagation(); this.beginEdit(entry.node.id); }}>${entry.node.name.length > 22 ? `${entry.node.name.slice(0, 20)}…` : entry.node.name}</text>
        </g>`;
      })}
    </svg>${this.renderFloatingEditor([], [])}`;
  }

  private renderFileTree() {
    return html`<div class="file-tree" role="tree" aria-label=${this.t("projectTree")}>${flattenTree(this.root).map((entry) => html`
      <div class="file-row ${entry.node.id === this.selectedId ? "selected" : ""}" data-node-id=${entry.node.id} style="--depth:${entry.depth}" role="treeitem" aria-level=${entry.depth + 1} aria-selected=${entry.node.id === this.selectedId} @click=${() => { if (!this.draft) { this.path = entry.path; this.select(entry.node.id); } }} @contextmenu=${(event: MouseEvent) => this.openContextMenu(event, "element", entry.node.id)}>
        <span class="branch" style=${`color:${treeLevelColors[entry.depth % treeLevelColors.length]}`} aria-hidden="true">${treeLevelSymbols[entry.depth % treeLevelSymbols.length]}</span>
        ${entry.node.id === this.draft?.id ? html`<input data-draft class="file-editor" maxlength=${ELEMENT_TEXT_LIMIT} aria-label=${this.t(this.draft.mode === "edit" ? "editorEdit" : "editorNew")} .value=${this.draft.mode === "edit" ? entry.node.name : ""} @click=${(event: Event) => event.stopPropagation()} @keydown=${this.draftKey} @blur=${(event: FocusEvent) => this.commitDraft(event.currentTarget as HTMLInputElement)} />` : html`<span class="name" title=${entry.node.id === this.selectedId ? nothing : entry.node.name}>${entry.node.name}</span><span class="meta">${entry.node.children.length ? this.t(entry.node.children.length === 1 ? "childCountOne" : "childCountMany", { count: entry.node.children.length }) : ""}</span>`}
      </div>`)} </div>`;
  }

  private renderIcon(name: "menu" | "back" | "sun" | "moon" | "copy" | "trash" | "edit" | "duplicate" | "download" | "plus") {
    if (name === "menu") return html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"></path></svg>`;
    if (name === "back") return html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 6-6 6 6 6M9 12h10"></path></svg>`;
    if (name === "sun") return html`<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.41M17.66 6.34l1.41-1.41"></path></svg>`;
    if (name === "moon") return html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 15.2A8.5 8.5 0 0 1 8.8 4 8.5 8.5 0 1 0 20 15.2Z"></path></svg>`;
    if (name === "copy") return html`<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"></rect><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path></svg>`;
    if (name === "trash") return html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"></path></svg>`;
    if (name === "edit") return html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20ZM14.5 7.5l3 3"></path></svg>`;
    if (name === "duplicate") return html`<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"></rect><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2M13.5 11v5M11 13.5h5"></path></svg>`;
    if (name === "download") return html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M5 20h14"></path></svg>`;
    return html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>`;
  }

  private renderSidebar() {
    if (!this.sidebarOpen) return nothing;
    return html`<aside class="map-sidebar" aria-label=${this.t("mapList")}>
      <h2>${this.t("mapList")}</h2>
      <div class="map-list">${this.workspace.maps.map((map) => html`
        <div class="map-row ${!this.tutorialOpen && map.id === this.workspace.activeMapId ? "active" : ""}" role="button" tabindex="0" aria-current=${!this.tutorialOpen && map.id === this.workspace.activeMapId ? "true" : nothing} @click=${() => this.switchMap(map.id)} @contextmenu=${(event: MouseEvent) => this.openContextMenu(event, "map", map.id)} @keydown=${(event: KeyboardEvent) => this.mapRowKey(event, map.id)}>
          ${this.editingMapId === map.id ? html`<input data-map-edit class="map-name-input" maxlength=${ELEMENT_TEXT_LIMIT} .value=${map.name} aria-label=${this.t("mapText")} @click=${(event: Event) => event.stopPropagation()} @contextmenu=${(event: Event) => event.stopPropagation()} @keydown=${(event: KeyboardEvent) => this.mapRenameKey(event, map.id)} @blur=${(event: FocusEvent) => this.commitMapRename(event.currentTarget as HTMLInputElement, map.id)} />` : html`<span class="map-row-label" title=${map.name}>${map.name}</span>`}
        </div>`)}
        <div class="map-row ${this.tutorialOpen ? "active" : ""}" role="button" tabindex="0" aria-current=${this.tutorialOpen ? "true" : nothing} @click=${this.openTutorial} @keydown=${(event: KeyboardEvent) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); this.openTutorial(); } }}>
          <span class="map-row-label">Tutorial</span>
        </div>
      </div>
    </aside>`;
  }

  private renderShortcutHints() {
    const hint = (keys: string[], description: TranslationKey) => html`<div class="shortcut-hint"><span class="shortcut-key-group">${keys.map((key, index) => html`${index ? html`<span aria-hidden="true">+</span>` : nothing}<kbd>${key}</kbd>`)}</span><span>${this.t(description)}</span></div>`;
    const selected = findEntry(this.root, this.selectedId);
    const canMoveUp = Boolean(selected?.parent && findEntry(this.root, selected.parent.id)?.parent);
    return html`<aside class="shortcut-hints" aria-label=${this.t("contextualShortcuts")}>
      ${this.view === "voronoi" ? this.path.length === 1 ? hint(["Enter"], "viewNode") : hint(["Shift", "Enter"], "goBack") : nothing}
      ${this.view === "file" ? html`${hint(["Enter"], "shortcutAddSibling")}${canMoveUp ? hint(["Shift", "Tab"], "shortcutOutdent") : hint(["Tab"], "shortcutIndent")}` : nothing}
      ${hint(["E"], "editElement")}
    </aside>`;
  }

  private renderContextToolbar() {
    const menu = this.contextMenu;
    if (!menu) return nothing;
    if (menu.kind === "element") {
      const entry = findEntry(this.root, menu.id);
      if (!entry) return nothing;
      return html`<div class="context-toolbar" role="toolbar" aria-label=${this.t("elementActions")} style=${`left:${menu.x}px;top:${menu.y}px`}>
        <button aria-label=${this.t("editElementAction")} title=${this.t("edit")} @click=${() => { this.contextMenu = null; this.beginEdit(menu.id); }}>${this.renderIcon("edit")}</button>
        <button aria-label=${this.t("copyElementName")} title=${this.t("copyName")} @click=${() => void this.copyElementName(menu.id)}>${this.renderIcon("copy")}</button>
        ${entry.parent ? html`<button aria-label=${this.t("deleteElement")} title=${this.t("delete")} @click=${() => this.deleteElement(menu.id)}>${this.renderIcon("trash")}</button>` : nothing}
      </div>`;
    }
    const map = this.workspace.maps.find(({ id }) => id === menu.id);
    if (!map) return nothing;
    return html`<div class="context-toolbar" role="toolbar" aria-label=${this.t("mapActions")} style=${`left:${menu.x}px;top:${menu.y}px`}>
      <button aria-label=${this.t("editMapName")} title=${this.t("editName")} @click=${() => this.beginMapRename(map.id)}>${this.renderIcon("edit")}</button>
      <button aria-label=${this.t("duplicateMap")} title=${this.t("duplicate")} @click=${() => this.duplicateWorkspaceMap(map.id)}>${this.renderIcon("duplicate")}</button>
      <button aria-label=${this.t("exportMap")} title=${this.t("export")} @click=${() => this.downloadMap(map)}>${this.renderIcon("download")}</button>
      <button aria-label=${this.t("deleteMap")} title=${this.t("delete")} @click=${() => this.deleteWorkspaceMap(map.id)}>${this.renderIcon("trash")}</button>
    </div>`;
  }

  render() {
    return html`<main class="workspace" lang=${this.language} tabindex="0" role="application" aria-label="Mapflowy" @pointerdown=${(event: PointerEvent) => this.workspacePointerDown(event)}>
      <div class="stage ${this.view === "file" ? "file" : ""}">${this.view === "voronoi" ? this.renderVoronoi() : this.view === "tree" ? this.renderTree() : this.renderFileTree()}</div>
      <div class="topbar">
        <div class="location-controls">
          <nav class="crumbs" aria-label=${this.t("currentLocation")}>${this.path.map((node, index) => html`${index ? html`<span class="separator" aria-hidden="true">/</span>` : nothing}<button class="crumb" aria-current=${index === this.path.length - 1 ? "location" : nothing} @click=${() => this.chooseBreadcrumb(node, index)}>${node.name}</button>`)}</nav>
          ${this.view === "voronoi" && this.path.length > 1 ? html`<button class="back-button" aria-label=${this.t("goUpOneLevel")} title=${this.t("goBack")} @click=${this.goBack}>${this.renderIcon("back")}</button>` : nothing}
        </div>
        <div class="top-actions"><button class="icon-button theme-toggle" aria-pressed=${this.theme === "dark"} aria-label=${this.t(this.theme === "dark" ? "switchToLight" : "switchToDark")} title=${this.t(this.theme === "dark" ? "switchToLight" : "switchToDark")} @click=${this.toggleTheme}>${this.renderIcon(this.theme === "dark" ? "sun" : "moon")}</button><button class="language-toggle" aria-label=${this.t(this.language === "en" ? "switchToSpanish" : "switchToEnglish")} title=${this.t(this.language === "en" ? "switchToSpanish" : "switchToEnglish")} @click=${() => this.setLanguage(this.language === "en" ? "es" : "en")}>${this.language === "en" ? "ES" : "EN"}</button></div>
      </div>
      <div class="switcher"><view-switcher .view=${this.view} .language=${this.language} @view-change=${(event: CustomEvent<OrganizerView>) => this.chooseView(event.detail)}></view-switcher></div>
      <div class="left-actions">
        <button class="sidebar-toggle" aria-expanded=${this.sidebarOpen} aria-label=${this.t(this.sidebarOpen ? "closeMapList" : "openMapList")} title=${this.t("mapList")} @click=${() => { this.sidebarOpen = !this.sidebarOpen; this.contextMenu = null; }}>${this.renderIcon("menu")}</button>
        <div class="quick-actions">
          <button class="quick-action-button new-map-button" aria-label=${this.t("createMap")} title=${this.t("createMap")} @click=${this.createMap}><kbd>N</kbd><span>${this.t("newMap")}</span></button>
          <button class="quick-action-button add-node-button" aria-label=${this.t("addNode")} title=${this.t("addNode")} @click=${this.addChildToSelected}><kbd>A</kbd><span>${this.t("addNode")}</span></button>
        </div>
      </div>
      ${this.renderSidebar()}
      ${this.renderContextToolbar()}
      ${this.renderShortcutHints()}
      ${this.depthLimitOpen ? html`<div class="modal-backdrop" @click=${(event: MouseEvent) => { if (event.target === event.currentTarget) this.depthLimitOpen = false; }}>
        <section class="depth-limit-modal" role="alertdialog" aria-modal="true" aria-labelledby="depth-limit-title" aria-describedby="depth-limit-message">
          <h2 id="depth-limit-title">${this.t("depthLimitTitle")}</h2>
          <p id="depth-limit-message">${this.t("depthLimitMessage", { count: MAX_TREE_LEVELS })}</p>
          <button @click=${() => { this.depthLimitOpen = false; }}>${this.t("close")}</button>
        </section>
      </div>` : nothing}
      ${this.storageSaveFailed ? html`<div class="save-error" role="alert">${this.t("saveError")}</div>` : nothing}
      ${this.toast ? html`<div class="toast ${this.storageSaveFailed ? "raised" : ""}" role="status">${this.toast}</div>` : nothing}
      <p class="sr-only" aria-live="polite">${this.status}</p>
    </main>`;
  }
}

declare global { interface HTMLElementTagNameMap { "organizer-app": OrganizerApp } }

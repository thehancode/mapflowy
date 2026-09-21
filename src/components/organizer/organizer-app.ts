import { LitElement, css, html, nothing, svg, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import "./view-switcher";
import type { OrganizerLanguage, OrganizerNode, OrganizerWorkspaceDocument, Point, LayoutEntry, OrganizerTheme, RadialTreeLayout, TranslationKey, TutorialDocument } from "../../lib/organizer";
import {
  canPlaceSubtreeAtDepth, circleLayout, collectNodeIds, createOnboardingRepository, createRepository, createTutorialDocument, createTutorialRepository, createUserConfigRepository, duplicateMap, ELEMENT_TEXT_LIMIT, emptyWorkspace, findEntry, flattenTree, fitLabel, GRAPH_ROOT_RADIUS, graphNodeLabelLines, localizeTutorialDocument, MAX_TREE_LEVELS, newChildColorIndex, newNodeId, NODE_PALETTE, nodeColorIndex, normalizeElementText,
  graphCameraForSelection, mobileGraphScene, polygonArea, polygonBottomBand, polygonCentroid, radialArcPath, radialLinkPath, radialTreeLayout, removeWorkspaceMap, roundedPolygonPath, visibleItems,
  translate, voronoiPathForSelection, voronoiPolygons,
} from "../../lib/organizer";
import { MarkShortcut } from "../../lib/organizer/mark-shortcut";
import type { OrganizerView } from "./view-switcher";
import type { GraphNavigationAdapter, OrganizerSession } from "./navigation-extension";

const treeLevelSymbols = ["●", "◆", "■", "▲"] as const;
const treeLevelColors = ["#e45745", "#db8437", "#c2a12f", "#79a944", "#3e9f70", "#329a98", "#4089c7", "#5d70c5", "#8860bd", "#ad5da5", "#c65e7b", "#a46d52"] as const;
type ContextMenuState = { kind: "element" | "map"; id: string; x: number; y: number };
const directions: Record<string, Point> = {
  ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
};
const viewShortcuts: Partial<Record<string, OrganizerView>> = { "1": "voronoi", "2": "tree", "3": "file" };

@customElement("organizer-app")
export class OrganizerApp extends LitElement {
  @property({ attribute: false }) session?: OrganizerSession;
  @property({ attribute: false }) graphNavigation?: GraphNavigationAdapter;
  private configRepository = createUserConfigRepository({ storage: { getItem: () => null, setItem: () => {} } });
  private readonly initialConfig = this.configRepository.load();
  private tutorialRepository = createTutorialRepository({ storage: null });
  private onboardingRepository = createOnboardingRepository({ storage: null });
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
  @state() private newMapNamingId: string | null = null;
  @state() private contextMenu: ContextMenuState | null = null;
  @state() private toast = "";
  @state() private storageSaveFailed = false;
  @state() private graphFocusId = "";
  private repository = createRepository({ storage: null });
  private resizeObserver?: ResizeObserver;
  private treeCycles = new Map<string, number>();
  private toastTimer?: number;
  private readonly markShortcut = new MarkShortcut();
  private resetMarkShortcut = (): void => this.markShortcut.reset();
  private pendingMapRestore?: { workspace: OrganizerWorkspaceDocument; tutorialOpen: boolean; path: OrganizerNode[]; selectedId: string };

  static styles = css`
    :host { --ink: #171a17; --selection: var(--ink); --background: #e8e7de; --file-background: #f4f3ec; --panel: rgba(250,249,244,.88); --panel-border: rgba(23,26,23,.13); --shadow: rgba(23,26,23,.12); --muted: #686a63; --cell-gap: #faf9f4; --add-child-idle: rgba(255,255,255,.08); --add-child-hover: rgba(255,255,255,.18); --row-hover: rgba(255,255,255,.58); --row-selected: #fff; --editor: rgba(255,255,255,.96); --dialog: #faf9f4; --kbd: #fff; display: block; width: 100%; height: 100dvh; min-height: 0; overflow: hidden; color: var(--ink); background: var(--background); color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    :host([theme="dark"]) { --ink: #f2f0e8; --selection: #b8bab2; --background: #151612; --file-background: #1b1c18; --panel: rgba(35,36,31,.9); --panel-border: rgba(242,240,232,.16); --shadow: rgba(0,0,0,.38); --muted: #aaa99f; --cell-gap: #151612; --add-child-idle: color-mix(in srgb, var(--ink) 6%, transparent); --add-child-hover: color-mix(in srgb, var(--ink) 14%, transparent); --row-hover: rgba(255,255,255,.06); --row-selected: #292a24; --editor: rgba(38,39,34,.98); --dialog: #23241f; --kbd: #30312b; color-scheme: dark; }
    * { box-sizing: border-box; }
    button, input { font: inherit; }
    .workspace { display: grid; grid-template-rows: auto minmax(0, 1fr); width: 100%; height: 100%; overflow: hidden; outline: none; background: var(--background); }
    .app-header { position: relative; z-index: 20; display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; gap: 1rem; min-height: 4.55rem; padding: .7rem 1rem; border-bottom: 1px solid var(--panel-border); background: var(--background); }
    .visualization { position: relative; min-width: 0; min-height: 0; overflow: hidden; }
    .stage { position: absolute; inset: 0; overflow: hidden; }
    .stage.file { overflow: auto; background: var(--file-background); }
    svg { display: block; width: 100%; height: 100%; }
    .header-brand { display: flex; align-items: center; gap: .15rem; justify-self: start; }
    .app-logo { display: flex; align-items: center; justify-content: center; width: 3.05rem; height: 3.05rem; flex: 0 0 3.05rem; padding: .28rem; border: 1px solid transparent; pointer-events: none; user-select: none; }
    .app-logo img { display: block; width: 100%; height: auto; max-height: 100%; object-fit: contain; user-select: none; -webkit-user-drag: none; }
    .switcher { min-width: 0; justify-self: center; }
    .top-actions { display: flex; justify-self: end; gap: .25rem; padding: .25rem; border: 1px solid var(--panel-border); border-radius: 999px; background: var(--panel); }
    .top-actions a, .top-actions button { min-height: 2.25rem; display: inline-flex; align-items: center; padding: 0 .78rem; border: 0; border-radius: 999px; background: transparent; color: var(--ink); text-decoration: none; font-size: .75rem; font-weight: 750; cursor: pointer; }
    .top-actions a { background: var(--ink); color: var(--background); }
    .icon-button { width: 2.25rem; justify-content: center; padding: 0 !important; }
    .language-toggle { min-width: 2.5rem; justify-content: center; padding: 0 .55rem !important; }
    .icon-button svg, .context-toolbar svg, .sidebar-toggle svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; pointer-events: none; }
    .sidebar-toggle { display: grid; place-items: center; width: 2.75rem; height: 2.75rem; padding: 0; border: 0; border-radius: 50%; background: transparent; color: var(--ink); cursor: pointer; transition: background-color .14s ease; }
    .node-actions { position: absolute; z-index: 12; left: 1rem; bottom: 1rem; display: flex; align-items: center; gap: .45rem; }
    .node-actions.with-navigation { flex-direction: column; }
    .node-actions button:disabled { opacity: .35; cursor: default; }
    .quick-action-button { display: inline-flex; align-items: center; gap: .55rem; min-height: 2rem; padding: .42rem .7rem; border: 1px solid var(--panel-border); border-radius: 999px; background: var(--panel); color: var(--muted); box-shadow: 0 8px 24px var(--shadow); backdrop-filter: blur(16px); font-size: .72rem; font-weight: 700; cursor: pointer; transition: background-color .14s ease; }
    .quick-action-button kbd { color: var(--ink); }
    .add-node-button { display: grid; place-items: center; width: 3.25rem; height: 3.25rem; min-height: 3.25rem; padding: 0; border-radius: 50%; color: var(--ink); }
    .add-node-button svg { width: 24px; height: 24px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; pointer-events: none; }
    .sidebar-toggle:hover, .quick-action-button:hover { background: var(--row-hover); }
    .map-sidebar { position: absolute; top: calc(100% + .45rem); left: 1rem; display: flex; flex-direction: column; width: min(310px, calc(100vw - 2rem)); max-height: 50dvh; overflow: hidden; border: 1px solid var(--panel-border); border-radius: 18px; background: var(--panel); box-shadow: 0 18px 52px var(--shadow); backdrop-filter: blur(18px); }
    .map-sidebar h2 { margin: 0; padding: .85rem 1rem; border-bottom: 1px solid var(--panel-border); background: color-mix(in srgb, #88afe0 18%, transparent); color: var(--ink); font-size: .72rem; font-weight: 850; letter-spacing: .12em; text-transform: uppercase; }
    .map-list { min-height: 0; overflow-y: auto; padding: .2rem .55rem .65rem; }
    .map-row { display: flex; align-items: center; width: 100%; min-height: 42px; padding: .35rem .55rem; border: 1px solid transparent; border-radius: 10px; background: transparent; color: var(--ink); cursor: pointer; }
    .map-row:hover { background: var(--row-hover); }
    .map-row.active { border-color: var(--panel-border); background: var(--row-selected); }
    .map-row-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .82rem; font-weight: 720; }
    .map-list .new-map-button { width: 100%; justify-content: center; margin-top: .25rem; box-shadow: none; }
    .map-name-editor { display: flex; align-items: center; gap: .35rem; width: 100%; }
    .map-name-input { min-width: 0; min-height: 32px; flex: 1; padding: 0 .5rem; border: 1px solid var(--panel-border); border-radius: 7px; background: var(--editor); color: var(--ink); outline: 0; font-weight: 700; }
    .map-name-confirm, .map-name-cancel { display: grid; place-items: center; width: 2rem; height: 2rem; flex: 0 0 2rem; padding: 0; border: 1px solid var(--panel-border); border-radius: 7px; background: var(--editor); color: var(--ink); cursor: pointer; }
    .map-name-confirm:hover, .map-name-cancel:hover { background: var(--row-hover); }
    .map-name-confirm svg, .map-name-cancel svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
    .context-toolbar { position: fixed; z-index: 40; display: flex; gap: .2rem; padding: .3rem; border: 1px solid var(--panel-border); border-radius: 999px; background: var(--panel); color: var(--ink); box-shadow: 0 14px 40px var(--shadow); backdrop-filter: blur(18px); }
    .context-toolbar button { display: grid; place-items: center; width: 2.35rem; height: 2.35rem; padding: 0; border: 0; border-radius: 50%; background: transparent; color: inherit; cursor: pointer; }
    .context-toolbar button:hover { background: var(--row-hover); }
    .cell { cursor: default; }
    .cell:focus { outline: none; }
    .cell-shape { transition: filter .14s ease; }
    .cell:hover .cell-shape { filter: brightness(.97) saturate(1.05); }
    .cell-outline { fill: none; stroke: var(--cell-gap); stroke-width: 12; stroke-linejoin: round; vector-effect: non-scaling-stroke; pointer-events: none; }
    .cell-label { fill: var(--ink); font-weight: 760; text-anchor: middle; cursor: text; user-select: none; paint-order: stroke; stroke: var(--cell-gap); stroke-width: 3px; stroke-linejoin: round; }
    .selection { fill: none; stroke: var(--selection); stroke-width: 20; stroke-linejoin: round; vector-effect: non-scaling-stroke; pointer-events: none; }
    .add-child-control { cursor: cell; outline: none; }
    .add-child-target { fill: var(--add-child-idle); stroke: none; transition: fill .14s ease; }
    .add-child-control:hover .add-child-target, .add-child-control:focus-visible .add-child-target { fill: var(--add-child-hover); }
    .add-child-sign { fill: #fff; font: 700 28px system-ui, sans-serif; text-anchor: middle; dominant-baseline: central; pointer-events: none; user-select: none; }
    :host([theme="dark"]) .add-child-sign { fill: var(--ink); }
    .tree-link { stroke: color-mix(in srgb, var(--ink) 25%, transparent); stroke-width: 2; vector-effect: non-scaling-stroke; }
    .graph-camera { transform-box: view-box; transform-origin: 0 0; transition: transform .22s ease-out; will-change: transform; }
    .graph-camera.instant { transition: none; }
    .tree-node { cursor: pointer; }
    .tree-node:focus { outline: none; }
    .tree-node .core { stroke: var(--cell-gap); stroke-width: 4; vector-effect: non-scaling-stroke; }
    .tree-node.current .core { stroke: var(--selection); stroke-width: 5; }
    .tree-node text { fill: var(--ink); font-size: 12px; font-weight: 750; text-anchor: middle; paint-order: stroke; stroke: var(--background); stroke-width: 3px; cursor: text; user-select: none; }
    .add-ring { fill: none; stroke: var(--ink); stroke-width: 8; stroke-linecap: round; opacity: .12; cursor: crosshair; vector-effect: non-scaling-stroke; }
    .add-ring:hover { opacity: .65; }
    .file-tree { min-height: 100%; padding: 1.1rem 1.1rem 5.5rem; }
    .file-row { display: flex; align-items: center; min-height: 44px; margin-left: calc(var(--depth) * 28px); padding: .35rem .65rem; border: 1px solid transparent; border-radius: 9px; cursor: pointer; }
    .file-row:hover { background: var(--row-hover); }
    .file-row.selected { border-color: var(--panel-border); background: var(--row-selected); box-shadow: 0 3px 12px var(--shadow); }
    .branch { flex: 0 0 20px; width: 20px; font-size: .78rem; line-height: 1; text-align: center; }
    .name { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .9rem; font-weight: 680; }
    .file-row.selected .name { overflow: visible; overflow-wrap: anywhere; text-overflow: clip; white-space: pre-wrap; }
    .cell.marked .cell-shape, .tree-node.marked .core { fill: #929292; }
    :host([theme="dark"]) .cell.marked .cell-shape, :host([theme="dark"]) .tree-node.marked .core { fill: #646464; }
    .cell.marked .cell-label, .tree-node.marked text, .file-row.marked .name { text-decoration: line-through; }
    .cell.marked .cell-label, .tree-node.marked text { stroke: none; }
    .file-row.marked .name { color: var(--muted); }
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
      :host { -webkit-user-select: none; user-select: none; }
      input { -webkit-user-select: text; user-select: text; }
      .app-header { grid-template-columns: auto minmax(0, 1fr) auto; gap: .35rem; min-height: 3.8rem; padding: .45rem .5rem; }
      .app-logo { width: 2.55rem; height: 2.55rem; padding: .18rem; }
      .switcher { width: 100%; }
      .top-actions { gap: .05rem; padding: .15rem; }
      .top-actions button { min-height: 2rem; }
      .icon-button { width: 2rem; }
      .language-toggle { min-width: 2.15rem; padding: 0 .35rem !important; font-size: .68rem !important; }
      .sidebar-toggle { width: 2.25rem; height: 2.25rem; }
      .node-actions { left: .65rem; bottom: .65rem; }
      .shortcut-hints, .quick-action-button kbd { display: none; }
      .map-sidebar { left: .5rem; width: min(310px, calc(100vw - 1rem)); }
      .file-tree { padding-top: .8rem; }
      .file-row { margin-left: calc(var(--depth) * 18px); }
      .tree-node text { font-size: 10px; cursor: pointer; pointer-events: none; }
      .add-ring { display: none; }
    }
    @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; } }
  `;

  connectedCallback(): void {
    const options = this.session ? { storage: this.session.storage } : {};
    this.configRepository = createUserConfigRepository(options);
    this.repository = createRepository(options);
    this.tutorialRepository = createTutorialRepository(options);
    this.onboardingRepository = createOnboardingRepository(options);
    const config = this.configRepository.load();
    this.theme = config.theme;
    this.language = config.language;
    super.connectedCallback();
    document.addEventListener("keydown", this.onKeyDown);
    document.addEventListener("keydown", this.onMarkKeyDown, true);
    document.addEventListener("pointerdown", this.resetMarkShortcut, true);
    document.addEventListener("focusout", this.resetMarkShortcut, true);
    window.addEventListener("blur", this.resetMarkShortcut);
  }

  disconnectedCallback(): void {
    this.graphNavigation?.disconnect();
    document.removeEventListener("keydown", this.onKeyDown);
    document.removeEventListener("keydown", this.onMarkKeyDown, true);
    document.removeEventListener("pointerdown", this.resetMarkShortcut, true);
    document.removeEventListener("focusout", this.resetMarkShortcut, true);
    window.removeEventListener("blur", this.resetMarkShortcut);
    this.resetMarkShortcut();
    this.resizeObserver?.disconnect();
    if (this.toastTimer) window.clearTimeout(this.toastTimer);
    super.disconnectedCallback();
  }

  protected firstUpdated(): void {
    const visualization = this.renderRoot.querySelector<HTMLElement>(".visualization")!;
    this.resizeObserver = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      this.width = Math.max(320, width); this.height = Math.max(180, height);
    });
    this.resizeObserver.observe(visualization);
    void this.load();
  }

  protected updated(changed: PropertyValues): void {
    this.graphNavigation?.attach(this);
    if (["selectedId", "view", "workspace", "tutorialOpen"].some((key) => changed.has(key))) this.resetMarkShortcut();
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
    if (this.session) this.workspace = structuredClone(this.session.workspace);
    this.tutorialDocument = this.tutorialRepository.load(this.language);
    this.tutorialOpen = firstVisit || this.workspace.maps.length === 0;
    if (this.session) this.tutorialOpen = false;
    this.sidebarOpen = false;
    if (firstVisit) {
      this.view = "tree";
      this.onboardingRepository.markSeen();
    }
    this.path = [this.root]; this.selectedId = this.root.id; this.graphFocusId = this.root.id; this.treeCycles.clear();
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
    this.path = [this.root]; this.selectedId = this.root.id; this.graphFocusId = this.root.id; this.draft = null; this.contextMenu = null; this.treeCycles.clear();
    this.setStatus(message);
  }

  private switchMap(id: string): void {
    if (this.newMapNamingId) { this.focusPendingMapName(); return; }
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
    if (this.newMapNamingId) { this.focusPendingMapName(); return; }
    if (this.draft) this.cancelDraft();
    this.pendingMapRestore = { workspace: this.workspace, tutorialOpen: this.tutorialOpen, path: this.path, selectedId: this.selectedId };
    this.tutorialOpen = false;
    const id = newNodeId(collectNodeIds(this.workspace.maps));
    const map: OrganizerNode = { id, name: this.t("untitledMap"), children: [] };
    this.workspace = { version: 3, activeMapId: id, maps: [...this.workspace.maps, map] };
    this.sidebarOpen = true; this.editingMapId = id; this.newMapNamingId = id;
    this.resetToRoot(this.t("newMapReady"));
    this.persist();
  }

  private openTutorial(): void {
    if (this.newMapNamingId) { this.focusPendingMapName(); return; }
    if (this.draft) this.cancelDraft();
    this.tutorialOpen = true;
    this.editingMapId = null;
    this.resetToRoot(this.t("tutorialOpened"));
  }

  private beginMapRename(id: string): void {
    if (this.newMapNamingId) { this.focusPendingMapName(); return; }
    this.contextMenu = null; this.sidebarOpen = true; this.editingMapId = id;
  }

  private focusPendingMapName(): void {
    requestAnimationFrame(() => this.renderRoot.querySelector<HTMLInputElement>("[data-map-edit]")?.focus());
  }

  private focusNode(id: string): void {
    requestAnimationFrame(() => {
      const target = Array.from(this.renderRoot.querySelectorAll<HTMLElement>("[data-node-id]")).find((element) => element.dataset.nodeId === id);
      (target ?? this.renderRoot.querySelector<HTMLElement>(".workspace"))?.focus();
    });
  }

  private commitMapRename(input: HTMLInputElement, id: string): void {
    if (this.editingMapId !== id) return;
    const map = this.workspace.maps.find((candidate) => candidate.id === id);
    if (!map) { this.editingMapId = null; this.newMapNamingId = null; this.pendingMapRestore = undefined; return; }
    const name = normalizeElementText(input.value, "");
    if (!name) { this.setStatus(this.t("mapNameRequired")); input.focus(); return; }
    const isNewMap = this.newMapNamingId === id;
    map.name = name;
    this.editingMapId = null;
    if (isNewMap) {
      this.newMapNamingId = null;
      this.pendingMapRestore = undefined;
      this.sidebarOpen = false;
      this.path = [map];
      this.selectedId = map.id;
      this.focusNode(map.id);
    }
    this.persistMaps(); this.setStatus(this.t("renamed", { name: map.name }));
  }

  private confirmMapName(id: string): void {
    const input = this.renderRoot.querySelector<HTMLInputElement>("[data-map-edit]");
    if (input) this.commitMapRename(input, id);
  }

  private cancelNewMap(id: string): void {
    if (this.newMapNamingId !== id || !this.pendingMapRestore) return;
    const restore = this.pendingMapRestore;
    this.workspace = restore.workspace;
    this.tutorialOpen = restore.tutorialOpen;
    this.path = restore.path;
    this.selectedId = restore.selectedId;
    this.editingMapId = null;
    this.newMapNamingId = null;
    this.pendingMapRestore = undefined;
    this.sidebarOpen = false;
    this.treeCycles.clear();
    this.persistMaps();
    this.setStatus(this.t("newMapCancelled"));
    this.focusNode(this.selectedId);
  }

  private mapRenameKey(event: KeyboardEvent, id: string): void {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      if (this.newMapNamingId === id) this.renderRoot.querySelector<HTMLButtonElement>(".map-name-confirm")?.focus();
      else this.commitMapRename(event.currentTarget as HTMLInputElement, id);
    }
    if (event.key === "Escape") {
      event.preventDefault();
      if (this.newMapNamingId === id) this.cancelNewMap(id);
      else this.editingMapId = null;
    }
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
    if (this.newMapNamingId === id) this.newMapNamingId = null;
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
    this.path = parent.path; this.selectedId = parent.node.id; this.graphFocusId = parent.node.id; this.treeCycles.clear(); this.persist();
    this.setStatus(this.t("removed", { name }));
  }

  private contextPosition(x: number, y: number): Pick<ContextMenuState, "x" | "y"> {
    const menuWidth = 190, menuHeight = 48, margin = 8;
    return { x: Math.max(margin, Math.min(x, window.innerWidth - menuWidth - margin)), y: Math.max(margin, Math.min(y, window.innerHeight - menuHeight - margin)) };
  }

  private openContextMenu(event: MouseEvent, kind: ContextMenuState["kind"], id: string): void {
    event.preventDefault(); event.stopPropagation();
    if (kind === "map" && this.newMapNamingId) { this.focusPendingMapName(); return; }
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
    if (this.sidebarOpen && !this.newMapNamingId && !includesClass("map-sidebar", "sidebar-toggle")) this.sidebarOpen = false;
  }

  private select(id: string): void { const name = findEntry(this.root, id)?.node.name ?? this.t("element"); this.selectedId = id; this.setStatus(this.t("elementSelected", { name })); }

  private chooseView(view: OrganizerView): void {
    if (this.draft) this.cancelDraft();
    this.contextMenu = null;
    if (view === "voronoi" && this.view !== "voronoi") {
      this.path = voronoiPathForSelection(this.root, this.selectedId);
    }
    if (view === "tree") this.graphFocusId = this.selectedId;
    this.view = view;
    this.setStatus(view === "tree" ? this.t("completeGraphView") : view === "file" ? this.t("treeViewReady") : this.t("currentLevel", { name: this.current.name }));
    this.renderRoot.querySelector<HTMLElement>(".workspace")?.focus();
  }

  private beginDraft(parent: OrganizerNode, restoreId = parent.id, insertionIndex = parent.children.length): void {
    if (this.draft) return;
    const parentEntry = findEntry(this.root, parent.id);
    if (!parentEntry) return;
    if (parentEntry.depth + 2 > MAX_TREE_LEVELS) { this.showDepthLimit(); return; }
    const id = newNodeId(flattenTree(this.root).map(({ node }) => node.id));
    const item: OrganizerNode = { id, name: "", children: [], colorIndex: newChildColorIndex(id, parent) };
    parent.children.splice(insertionIndex, 0, item);
    this.draft = { id: item.id, parentId: parent.id, restoreId, mode: "create" };
    this.selectedId = item.id; this.treeCycles.clear(); this.requestUpdate();
    if (this.view === "tree") this.graphFocusId = item.id;
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
    const entry = this.view === "file" && mode === "create"
      ? findEntry(this.root, id)!
      : findEntry(this.root, mode === "create" ? parentId : id)!;
    this.selectedId = entry.node.id;
    if (this.view === "tree") this.graphFocusId = entry.node.id;
    if (this.view !== "voronoi") this.path = entry.path;
    this.persist(); this.setStatus(this.t(mode === "edit" ? "renamed" : "created", { name }));
    if (this.view === "file" && mode === "create") this.focusNode(id);
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
    this.path = restored.path; this.selectedId = restored.node.id; this.graphFocusId = restored.node.id; this.requestUpdate(); this.setStatus(this.t("newElementCancelled"));
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
    const layout = this.width <= 600 ? mobileGraphScene(this.root, this.width, this.height).layout : radialTreeLayout(this.root, this.width, this.height);
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
    const next = candidates[cycle].entry; this.path = next.path; this.selectedId = next.node.id; this.graphFocusId = next.node.id;
    this.setStatus(this.t("currentNode", { name: next.node.name }) + (candidates.length > 1 ? this.t("connectedChoice", { current: cycle + 1, total: candidates.length }) : ""));
  }

  private moveFile(key: string): void {
    const entries = flattenTree(this.root), index = entries.findIndex((entry) => entry.node.id === this.selectedId), selected = entries[index];
    if (!selected) return;
    const next = key === "ArrowUp" ? entries[index - 1] : key === "ArrowDown" ? entries[index + 1] : key === "ArrowLeft" ? (selected.parent ? findEntry(this.root, selected.parent.id) : null) : selected.node.children.length ? findEntry(this.root, selected.node.children[0].id) : null;
    if (next) { this.path = next.path; this.select(next.node.id); }
  }

  private toggleMark(id: string): void {
    const node = findEntry(this.root, id)?.node;
    if (!node) return;
    if (node.marked) delete node.marked;
    else node.marked = true;
    this.persist();
    this.setStatus(this.t(node.marked ? "nodeMarked" : "nodeUnmarked", { name: node.name }));
  }

  private onMarkKeyDown = (event: KeyboardEvent): void => {
    const path = event.composedPath();
    const blockedTarget = path.some((target) => target instanceof Element && (
      target.matches('input, textarea, select, button, a, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="menu"], [role="dialog"], [role="toolbar"]') ||
      (target.getAttribute("role") === "button" && !target.classList.contains("tree-node"))
    ));
    if (event.key !== " " || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.isComposing ||
        !this.isConnected || !path.includes(this) || blockedTarget || this.draft || this.editingMapId ||
        this.sidebarOpen || this.contextMenu || this.depthLimitOpen) {
      this.resetMarkShortcut();
      return;
    }
    const node = findEntry(this.root, this.selectedId)?.node;
    if (!node) { this.resetMarkShortcut(); return; }
    event.preventDefault();
    event.stopPropagation();
    if (this.markShortcut.press(node, this.view, event.timeStamp, event.repeat)) this.toggleMark(node.id);
  };

  private middleClickNode(event: MouseEvent): Element | undefined {
    if (event.button !== 1 || this.draft || this.editingMapId || this.depthLimitOpen) return;
    return event.composedPath().find((target): target is Element => target instanceof Element && target.hasAttribute("data-node-id"));
  }

  private onNodeMouseDown(event: MouseEvent): void {
    if (this.middleClickNode(event)) event.preventDefault();
  }

  private onNodeAuxClick(event: MouseEvent): void {
    const element = this.middleClickNode(event);
    if (!element) return;
    event.preventDefault(); event.stopPropagation();
    this.resetMarkShortcut();
    const entry = findEntry(this.root, element.getAttribute("data-node-id")!);
    if (!entry) return;
    this.select(entry.node.id);
    if (this.view !== "voronoi") this.path = entry.path;
    this.renderRoot.querySelector<HTMLElement>(".workspace")?.focus();
    this.toggleMark(entry.node.id);
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    const target = event.composedPath()[0];
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
    if (!this.isConnected) return;
    if (this.depthLimitOpen) {
      if (event.key === "Escape") { event.preventDefault(); this.depthLimitOpen = false; }
      return;
    }
    if (event.key === "Escape" && this.newMapNamingId) { event.preventDefault(); this.focusPendingMapName(); return; }
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

  focusGraphNode(id: string): void {
    const entry = findEntry(this.root, id);
    if (entry) this.chooseTreeNode(entry);
  }

  private chooseTreeNode(entry: Pick<LayoutEntry, "node" | "path">): void { this.graphNavigation?.select(entry.node.id); this.path = entry.path; this.selectedId = entry.node.id; this.graphFocusId = entry.node.id; this.setStatus(this.t("nowCurrentLevel", { name: entry.node.name })); }

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
        const parentBand = isParent ? polygonBottomBand(polygon) : [];
        const activateEdge = (event: Event) => { event.preventDefault(); event.stopPropagation(); this.openVoronoiNodeAndAddChild(item); };
        const addMarker = isParent && polygonArea(parentBand) >= 1 ? polygonCentroid(parentBand) : null;
        return svg`<g class="cell ${item.marked ? "marked" : ""}" data-node-id=${item.id} tabindex="-1" role="option" aria-selected=${selected} @click=${() => this.select(item.id)} @dblclick=${() => { if (isParent) this.goBack(); else this.openVoronoiNode(item); }} @contextmenu=${(event: MouseEvent) => this.openContextMenu(event, "element", item.id)}>
          <path class="cell-shape" d=${roundedPolygonPath(polygon)} fill=${NODE_PALETTE[nodeColorIndex(item)]}></path>
          ${addMarker ? svg`<g class="add-child-control" role="button" tabindex="0" aria-label=${this.t("openAndAddChild", { name: item.name })} clip-path=${`url(#edge-cell-${index})`} @click=${activateEdge} @dblclick=${(event: Event) => event.stopPropagation()} @keydown=${(event: KeyboardEvent) => { if (event.key === "Enter" || event.key === " ") activateEdge(event); }}><circle class="add-child-target" cx=${addMarker.x} cy=${addMarker.y} r="30"></circle><text class="add-child-sign" x=${addMarker.x} y=${addMarker.y} aria-hidden="true">+</text></g>` : nothing}
          ${selected ? svg`<path class="selection" d=${roundedPolygonPath(polygon)} clip-path=${`url(#edge-cell-${index})`}></path>` : nothing}
          <path class="cell-outline" d=${roundedPolygonPath(polygon)}></path>
          ${item.id !== this.draft?.id ? svg`<text class="cell-label" x=${center.x} y=${center.y} font-size=${label.size} dy=".35em" @dblclick=${(event: MouseEvent) => { event.stopPropagation(); this.beginEdit(item.id); }}>${label.text}</text>` : nothing}
        </g>`;
      })}
    </svg>${this.renderFloatingEditor(sites, polygons)}`;
  }

  private renderFloatingEditor(sites: Array<Point & { id: string }>, polygons: Point[][], treeLayout?: RadialTreeLayout, camera: Point = { x: 0, y: 0 }) {
    if (!this.draft || this.view === "file") return nothing;
    const index = sites.findIndex((site) => site.id === this.draft!.id);
    let position: Point | undefined;
    if (this.view === "tree") {
      const entry = (treeLayout ?? radialTreeLayout(this.root, this.width, this.height)).nodes.find(({ node }) => node.id === this.draft!.id);
      if (entry) position = { x: entry.x - camera.x, y: entry.y - camera.y };
    }
    else if (index >= 0) position = polygonCentroid(polygons[index]);
    if (!position) return nothing;
    const editing = this.draft.mode === "edit";
    const value = editing ? findEntry(this.root, this.draft.id)?.node.name ?? "" : "";
    return html`<input data-draft class="editor" style="left:${position.x}px;top:${position.y}px" maxlength=${ELEMENT_TEXT_LIMIT} aria-label=${this.t(editing ? "editorEdit" : "editorNew")} .value=${value} @keydown=${this.draftKey} @blur=${(event: FocusEvent) => this.commitDraft(event.currentTarget as HTMLInputElement)} />`;
  }

  private renderTree() {
    const mobile = this.width <= 600 || !!this.graphNavigation;
    const scene = mobile
      ? mobileGraphScene(this.root, this.width, this.height)
      : { layout: radialTreeLayout(this.root, this.width, this.height), width: this.width, height: this.height };
    const layout = scene.layout;
    const automatic = mobile ? graphCameraForSelection(scene, this.graphFocusId || this.selectedId, this.width, this.height) : { x: 0, y: 0 };
    const camera = this.graphNavigation?.resolve({ scene, width: this.width, height: this.height, selectedId: this.selectedId, focusId: this.graphFocusId, automatic, editing: !!this.draft }) ?? automatic;
    return html`<svg data-graph-canvas style=${this.graphNavigation ? "touch-action:none" : ""} viewBox="0 0 ${this.width} ${this.height}" role="img" aria-label=${this.t("completeProjectGraph")}>
      <g class="graph-camera ${this.draft || this.graphNavigation?.instant ? "instant" : ""}" style=${`transform:translate(${-camera.x}px,${-camera.y}px)`}>
        ${layout.links.map(({ source, target }) => svg`<path class="tree-link" fill="none" d=${radialLinkPath(source, target, layout.centerX, layout.centerY, layout.outerRadiusX, layout.outerRadiusY)}></path>`)}
        ${layout.nodes.map((entry) => {
          const current = entry.node.id === this.current.id, selected = entry.node.id === this.selectedId, radius = entry.depth === 0 ? GRAPH_ROOT_RADIUS : 19;
          const labelLines = graphNodeLabelLines(entry.node.name);
          const labelY = entry.depth === 0 ? 39 : 34;
          return svg`<g class="tree-node ${current ? "current" : ""} ${entry.node.marked ? "marked" : ""}" data-node-id=${entry.node.id} tabindex="0" role="button" aria-label=${this.t("nodeLevel", { name: entry.node.name, level: entry.depth + 1 })} transform="translate(${entry.x} ${entry.y})" @click=${() => this.chooseTreeNode(entry)} @contextmenu=${(event: MouseEvent) => this.openContextMenu(event, "element", entry.node.id)} @keydown=${(event: KeyboardEvent) => { if (event.key === "Enter" || event.key === " ") this.chooseTreeNode(entry); }}>
            <title>${entry.node.name}</title>
            <circle class="core" r=${radius} fill=${NODE_PALETTE[nodeColorIndex(entry.node)]}></circle>
            ${selected ? svg`<circle r=${radius + 4} fill="none" stroke="var(--selection)" stroke-width="2"></circle>` : nothing}
            ${this.graphNavigation ? nothing : svg`<path class="add-ring" d=${radialArcPath(radius + 8, 225, -45, true)} aria-label=${this.t("addChildren")} @click=${(event: Event) => { event.stopPropagation(); this.chooseTreeNode(entry); this.beginDraft(entry.node); }}><title>${this.t("addChildren")}</title></path>`}
            <text style=${this.graphNavigation ? "pointer-events:auto" : ""} y=${labelY} @click=${(event: MouseEvent) => { event.stopPropagation(); if (this.graphNavigation) this.chooseTreeNode(entry); else this.beginEdit(entry.node.id); }}>${labelLines.map((line, index) => svg`<tspan x="0" dy=${labelLines.length === 1 ? "0" : index === 0 ? "-.55em" : "1.1em"}>${line}</tspan>`)}</text>
          </g>`;
        })}
      </g>
      ${this.graphNavigation?.overlay() ?? nothing}
    </svg>${this.renderFloatingEditor([], [], layout, camera)}`;
  }

  private renderFileTree() {
    return html`<div class="file-tree" role="tree" aria-label=${this.t("projectTree")}>${flattenTree(this.root).map((entry) => html`
      <div class="file-row ${entry.node.id === this.selectedId ? "selected" : ""} ${entry.node.marked ? "marked" : ""}" data-node-id=${entry.node.id} tabindex="-1" style="--depth:${entry.depth}" role="treeitem" aria-level=${entry.depth + 1} aria-selected=${entry.node.id === this.selectedId} @click=${() => { if (!this.draft) { this.path = entry.path; this.select(entry.node.id); } }} @dblclick=${() => this.beginEdit(entry.node.id)} @contextmenu=${(event: MouseEvent) => this.openContextMenu(event, "element", entry.node.id)}>
        <span class="branch" style=${`color:${treeLevelColors[entry.depth % treeLevelColors.length]}`} aria-hidden="true">${treeLevelSymbols[entry.depth % treeLevelSymbols.length]}</span>
        ${entry.node.id === this.draft?.id ? html`<input data-draft class="file-editor" maxlength=${ELEMENT_TEXT_LIMIT} aria-label=${this.t(this.draft.mode === "edit" ? "editorEdit" : "editorNew")} .value=${this.draft.mode === "edit" ? entry.node.name : ""} @click=${(event: Event) => event.stopPropagation()} @keydown=${this.draftKey} @blur=${(event: FocusEvent) => this.commitDraft(event.currentTarget as HTMLInputElement)} />` : html`<span class="name" title=${entry.node.id === this.selectedId ? nothing : entry.node.name}>${entry.node.name}</span><span class="meta">${entry.node.children.length ? this.t(entry.node.children.length === 1 ? "childCountOne" : "childCountMany", { count: entry.node.children.length }) : ""}</span>`}
      </div>`)} </div>`;
  }

  private renderIcon(name: "menu" | "sun" | "moon" | "copy" | "trash" | "edit" | "duplicate" | "download" | "check" | "close" | "plus") {
    if (name === "menu") return html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"></path></svg>`;
    if (name === "sun") return html`<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.41M17.66 6.34l1.41-1.41"></path></svg>`;
    if (name === "moon") return html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 15.2A8.5 8.5 0 0 1 8.8 4 8.5 8.5 0 1 0 20 15.2Z"></path></svg>`;
    if (name === "copy") return html`<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"></rect><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path></svg>`;
    if (name === "trash") return html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"></path></svg>`;
    if (name === "edit") return html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20ZM14.5 7.5l3 3"></path></svg>`;
    if (name === "duplicate") return html`<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"></rect><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2M13.5 11v5M11 13.5h5"></path></svg>`;
    if (name === "download") return html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M5 20h14"></path></svg>`;
    if (name === "check") return html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"></path></svg>`;
    if (name === "close") return html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"></path></svg>`;
    return html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>`;
  }

  private renderSidebar() {
    if (!this.sidebarOpen) return nothing;
    return html`<aside class="map-sidebar" aria-label=${this.t("mapList")}>
      <h2>${this.t("mapList")}</h2>
      <div class="map-list">${this.workspace.maps.map((map) => html`
        <div class="map-row ${!this.tutorialOpen && map.id === this.workspace.activeMapId ? "active" : ""}" role="button" tabindex="0" aria-current=${!this.tutorialOpen && map.id === this.workspace.activeMapId ? "true" : nothing} @click=${() => this.switchMap(map.id)} @contextmenu=${(event: MouseEvent) => this.openContextMenu(event, "map", map.id)} @keydown=${(event: KeyboardEvent) => this.mapRowKey(event, map.id)}>
          ${this.editingMapId === map.id ? html`<div class="map-name-editor" @click=${(event: Event) => event.stopPropagation()} @contextmenu=${(event: Event) => event.stopPropagation()}>
            <input data-map-edit class="map-name-input" maxlength=${ELEMENT_TEXT_LIMIT} .value=${map.name} aria-label=${this.t("mapText")} @keydown=${(event: KeyboardEvent) => this.mapRenameKey(event, map.id)} @blur=${(event: FocusEvent) => { if (this.newMapNamingId !== map.id) this.commitMapRename(event.currentTarget as HTMLInputElement, map.id); }} />
            <button class="map-name-confirm" aria-label=${this.t("confirmMapName")} title=${this.t("confirmMapName")} @keydown=${(event: KeyboardEvent) => event.stopPropagation()} @click=${(event: MouseEvent) => { event.stopPropagation(); this.confirmMapName(map.id); }}>${this.renderIcon("check")}</button>
            ${this.newMapNamingId === map.id ? html`<button class="map-name-cancel" aria-label=${this.t("cancelNewMap")} title=${this.t("cancelNewMap")} @keydown=${(event: KeyboardEvent) => event.stopPropagation()} @click=${(event: MouseEvent) => { event.stopPropagation(); this.cancelNewMap(map.id); }}>${this.renderIcon("close")}</button>` : nothing}
          </div>` : html`<span class="map-row-label" title=${map.name}>${map.name}</span>`}
        </div>`)}
        <div class="map-row ${this.tutorialOpen ? "active" : ""}" role="button" tabindex="0" aria-current=${this.tutorialOpen ? "true" : nothing} @click=${this.openTutorial} @keydown=${(event: KeyboardEvent) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); this.openTutorial(); } }}>
          <span class="map-row-label">Tutorial</span>
        </div>
        <button class="quick-action-button new-map-button" aria-label=${this.t("createMap")} title=${this.t("createMap")} @click=${this.createMap}><kbd>N</kbd><span>${this.t("newMap")}</span></button>
      </div>
    </aside>`;
  }

  private renderShortcutHint(keys: string[], description: TranslationKey, simultaneous = true) {
    return html`<div class="shortcut-hint"><span class="shortcut-key-group">${keys.map((key, index) => html`${index && simultaneous ? html`<span aria-hidden="true">+</span>` : nothing}<kbd>${key}</kbd>`)}</span><span>${this.t(description)}</span></div>`;
  }

  private renderShortcutHints() {
    const hint = (keys: string[], description: TranslationKey) => this.renderShortcutHint(keys, description);
    const selected = findEntry(this.root, this.selectedId);
    const canMoveUp = Boolean(selected?.parent && findEntry(this.root, selected.parent.id)?.parent);
    return html`<aside class="shortcut-hints" aria-label=${this.t("contextualShortcuts")}>
      ${this.view === "voronoi" ? this.path.length === 1 ? hint(["Enter"], "viewNode") : hint(["Shift", "Enter"], "goBack") : nothing}
      ${this.view === "file" ? html`${hint(["Enter"], "shortcutAddSibling")}${canMoveUp ? hint(["Shift", "Tab"], "shortcutOutdent") : hint(["Tab"], "shortcutIndent")}` : nothing}
      ${this.renderShortcutHint([this.t("spaceKey"), this.t("spaceKey")], "markNode", false)}
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
      <header class="app-header">
        <div class="header-brand">
          <button class="sidebar-toggle" aria-expanded=${this.sidebarOpen} aria-label=${this.t(this.sidebarOpen ? "closeMapList" : "openMapList")} title=${this.t("mapList")} @click=${() => { if (this.newMapNamingId) { this.focusPendingMapName(); return; } this.sidebarOpen = !this.sidebarOpen; this.contextMenu = null; }}>${this.renderIcon("menu")}</button>
          <span class="app-logo" aria-hidden="true"><img src="/icon.svg" width="80" height="34" alt="" draggable="false" /></span>
          ${this.renderSidebar()}
        </div>
        <div class="switcher"><view-switcher .view=${this.view} .language=${this.language} @view-change=${(event: CustomEvent<OrganizerView>) => this.chooseView(event.detail)}></view-switcher></div>
        <div class="top-actions"><button class="icon-button theme-toggle" aria-pressed=${this.theme === "dark"} aria-label=${this.t(this.theme === "dark" ? "switchToLight" : "switchToDark")} title=${this.t(this.theme === "dark" ? "switchToLight" : "switchToDark")} @click=${this.toggleTheme}>${this.renderIcon(this.theme === "dark" ? "sun" : "moon")}</button><button class="language-toggle" aria-label=${this.t(this.language === "en" ? "switchToSpanish" : "switchToEnglish")} title=${this.t(this.language === "en" ? "switchToSpanish" : "switchToEnglish")} @click=${() => this.setLanguage(this.language === "en" ? "es" : "en")}>${this.language === "en" ? "ES" : "EN"}</button></div>
      </header>
      <section class="visualization" aria-label=${this.t("displayMode")}>
        <div class="stage ${this.view === "file" ? "file" : ""}" @mousedown=${this.onNodeMouseDown} @auxclick=${this.onNodeAuxClick}>${this.view === "voronoi" ? this.renderVoronoi() : this.view === "tree" ? this.renderTree() : this.renderFileTree()}</div>
        <div class="node-actions ${this.graphNavigation && this.view === "tree" ? "with-navigation" : ""}">${this.view === "tree" ? this.graphNavigation?.actions?.() ?? nothing : nothing}<button class="quick-action-button add-node-button" aria-label=${this.t("addNode")} title=${this.t("addNode")} @click=${this.addChildToSelected}>${this.renderIcon("plus")}</button></div>
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
      </section>
      <p class="sr-only" aria-live="polite">${this.status}</p>
    </main>`;
  }
}

declare global { interface HTMLElementTagNameMap { "organizer-app": OrganizerApp } }

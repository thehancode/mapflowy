import type { LayoutEntry, OrganizerNode } from "../../lib/organizer";
import type { OrganizerApp } from "../organizer/organizer-app";
import { NavigationController } from "./controller";
import { LayoutSession } from "./layout-session";
import type { LayoutKind } from "./layouts";

function hexToHsl(hex: string): [number, number, number] {
  const [red, green, blue] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const maximum = Math.max(red, green, blue), minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  let hue = 0;
  if (delta) {
    if (maximum === red) hue = 60 * (((green - blue) / delta) % 6);
    else if (maximum === green) hue = 60 * ((blue - red) / delta + 2);
    else hue = 60 * ((red - green) / delta + 4);
  }
  const lightness = (maximum + minimum) / 2;
  return [(hue + 360) % 360, delta ? delta / (1 - Math.abs(2 * lightness - 1)) : 0, lightness];
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const section = hue / 60, x = chroma * (1 - Math.abs(section % 2 - 1));
  const channels = section < 1 ? [chroma, x, 0] : section < 2 ? [x, chroma, 0] : section < 3 ? [0, chroma, x]
    : section < 4 ? [0, x, chroma] : section < 5 ? [x, 0, chroma] : [chroma, 0, x];
  const offset = lightness - chroma / 2;
  return "#" + channels.map(value => Math.round((value + offset) * 255).toString(16).padStart(2, "0")).join("");
}

// Match the standalone color study: eight shades along the shortest HSL arc.
const LEVEL_COLOR_PALETTES = [
  ["#f38b70", "#df9eb6"],
  ["#e5a665", "#efc65d"],
  ["#88afe0", "#b99bdf"],
  ["#c5d36c", "#71c1b2"],
  ["#71c1b2", "#88afe0"],
].map(([from, to]) => {
  const start = hexToHsl(from), end = hexToHsl(to);
  const hueDistance = ((end[0] - start[0] + 540) % 360) - 180;
  return Array.from({ length: 8 }, (_, index) => {
    if (index === 0) return from;
    if (index === 7) return to;
    const progress = index / 7;
    return hslToHex((start[0] + hueDistance * progress + 360) % 360,
      start[1] + (end[1] - start[1]) * progress, start[2] + (end[2] - start[2]) * progress);
  });
});

function stableShade(id: string): number {
  let hash = 2166136261;
  for (const character of id) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0) % 8;
}

export class LayoutController extends NavigationController {
  readonly layouts: LayoutSession;
  private host?: OrganizerApp;
  constructor(kind: LayoutKind = "balloon", changed: () => void) {
    super(changed);
    this.layouts = new LayoutSession(kind, () => { changed(); this.host?.requestUpdate(); });
  }
  createScene(root: OrganizerNode, width: number, height: number) { return this.layouts.get(root, width, height); }
  linkPath(source: LayoutEntry, target: LayoutEntry): string {
    return `M ${source.x} ${source.y} L ${target.x} ${target.y}`;
  }
  nodeFill(entry: LayoutEntry): string {
    const palette = LEVEL_COLOR_PALETTES[entry.depth % LEVEL_COLOR_PALETTES.length];
    return palette[entry.depth === 0 ? 0 : stableShade(entry.node.id)];
  }
  override attach(app: OrganizerApp): void { this.host = app; super.attach(app); }
  override disconnect(): void { this.layouts.dispose(); this.host = undefined; super.disconnect(); }
}

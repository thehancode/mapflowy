import type { LayoutEntry, OrganizerNode } from "../../lib/organizer";
import type { OrganizerApp } from "../organizer/organizer-app";
import { NavigationController } from "./controller";
import { LayoutSession } from "./layout-session";
import type { LayoutKind } from "./layouts";

const LEVEL_COLOR_PALETTES = [
  [216, 195, 174, 153, 132, 111, 78, 45],   // blue to golden
  [12, 357, 342, 327, 312, 297, 282, 267],  // coral to lavender
  [174, 197, 220, 243, 266, 289, 312, 335], // teal to pink
  [78, 60, 42, 24, 6, 348, 330, 312],       // citron green to magenta
] as const;

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
    const dx = target.x - source.x, dy = target.y - source.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const bend = Math.min(22, distance * .1) * (target.index % 2 ? -1 : 1);
    const nx = -dy / distance * bend, ny = dx / distance * bend;
    return `M ${source.x} ${source.y} C ${source.x + dx * .34 + nx} ${source.y + dy * .34 + ny}, ${source.x + dx * .68 + nx} ${source.y + dy * .68 + ny}, ${target.x} ${target.y}`;
  }
  nodeFill(entry: LayoutEntry): string {
    const palette = LEVEL_COLOR_PALETTES[entry.depth % LEVEL_COLOR_PALETTES.length];
    const hue = palette[stableShade(entry.node.id)];
    return `hsl(${hue} 58% 62%)`;
  }
  override attach(app: OrganizerApp): void { this.host = app; super.attach(app); }
  override disconnect(): void { this.layouts.dispose(); this.host = undefined; super.disconnect(); }
}

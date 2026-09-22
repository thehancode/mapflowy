import { graphNodeLabelLines } from "./geometry";
import { radialTreeLayout } from "./tree";
import type { LayoutEntry, OrganizerNode, RadialTreeLayout } from "./types";

export interface MobileGraphScene {
  layout: RadialTreeLayout;
  width: number;
  height: number;
}

export interface GraphCamera {
  x: number;
  y: number;
}

const MIN_NODE_DISTANCE = 64;
const LABEL_GAP = 8;
const MAX_SCALE = 20;

function labelBox(entry: LayoutEntry) {
  const lines = graphNodeLabelLines(entry.node.name);
  const width = Math.max(36, Math.min(126, Math.max(...lines.map((line) => Array.from(line).length)) * 6));
  const height = lines.length * 12;
  const centerY = entry.y + (entry.depth === 0 ? 39 : 34);
  return { left: entry.x - width / 2, right: entry.x + width / 2, top: centerY - height / 2, bottom: centerY + height / 2 };
}

function graphIsCrowded(layout: RadialTreeLayout): boolean {
  const boxes = layout.nodes.map(labelBox);
  for (let left = 0; left < layout.nodes.length; left += 1) {
    for (let right = left + 1; right < layout.nodes.length; right += 1) {
      const first = layout.nodes[left], second = layout.nodes[right];
      if (Math.hypot(first.x - second.x, first.y - second.y) < MIN_NODE_DISTANCE) return true;
      const a = boxes[left], b = boxes[right];
      if (a.left < b.right + LABEL_GAP && a.right + LABEL_GAP > b.left && a.top < b.bottom + LABEL_GAP && a.bottom + LABEL_GAP > b.top) return true;
    }
  }
  return false;
}

export function mobileGraphScene(root: OrganizerNode, viewportWidth: number, viewportHeight: number): MobileGraphScene {
  let scale = 1;
  let width = viewportWidth, height = viewportHeight;
  let layout = radialTreeLayout(root, width, height);
  while (graphIsCrowded(layout) && scale < MAX_SCALE) {
    scale = Math.min(MAX_SCALE, scale * 1.05);
    width = viewportWidth * scale;
    height = viewportHeight * scale;
    layout = radialTreeLayout(root, width, height);
  }
  return { layout, width, height };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(value, maximum));
}

function cameraAxis(selected: number, subtreeMin: number, subtreeMax: number, subtreeCenter: number, viewport: number, canvas: number): number {
  if (canvas <= viewport) return 0;
  const targetCenter = (selected + subtreeCenter) / 2;
  const targetOrigin = targetCenter - viewport / 2;
  const canvasMinimum = 0, canvasMaximum = canvas - viewport;
  const safeMinimum = selected - viewport * .8;
  const safeMaximum = selected - viewport * .2;
  const padding = 24;
  const subtreeFits = subtreeMax - subtreeMin + padding * 2 <= viewport;
  const subtreeMinimum = subtreeMax + padding - viewport;
  const subtreeMaximum = subtreeMin - padding;
  const allowedMinimum = Math.max(canvasMinimum, safeMinimum, subtreeFits ? subtreeMinimum : canvasMinimum);
  const allowedMaximum = Math.min(canvasMaximum, safeMaximum, subtreeFits ? subtreeMaximum : canvasMaximum);
  if (allowedMinimum <= allowedMaximum) return clamp(targetOrigin, allowedMinimum, allowedMaximum);
  const safeAllowedMinimum = Math.max(canvasMinimum, safeMinimum);
  const safeAllowedMaximum = Math.min(canvasMaximum, safeMaximum);
  return safeAllowedMinimum <= safeAllowedMaximum
    ? clamp(targetOrigin, safeAllowedMinimum, safeAllowedMaximum)
    : clamp(targetOrigin, canvasMinimum, canvasMaximum);
}

export function graphCameraForSelection(scene: MobileGraphScene, selectedId: string, viewportWidth: number, viewportHeight: number): GraphCamera {
  const selected = scene.layout.nodes.find(({ node }) => node.id === selectedId) ?? scene.layout.nodes[0];
  if (!selected) return { x: 0, y: 0 };
  const subtree = scene.layout.nodes.filter(({ path }) => path.some(({ id }) => id === selected.node.id));
  const xs = subtree.map(({ x }) => x), ys = subtree.map(({ y }) => y);
  const minimumX = Math.min(...xs), maximumX = Math.max(...xs), minimumY = Math.min(...ys), maximumY = Math.max(...ys);
  return {
    x: cameraAxis(selected.x, minimumX, maximumX, (minimumX + maximumX) / 2, viewportWidth, scene.width),
    y: cameraAxis(selected.y, minimumY, maximumY, (minimumY + maximumY) / 2, viewportHeight, scene.height),
  };
}

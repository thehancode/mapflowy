import { findEntry } from "./tree";
import type { LayoutEntry, OrganizerNode, TreeEntry } from "./types";

/** Root uses spatial children; other nodes use live hierarchy and root-relative vertical keys. */
export function hierarchyTarget(root: OrganizerNode, selectedId: string, key: string, positions: readonly Pick<LayoutEntry, "node" | "x" | "y">[] = []): TreeEntry | null {
  const selected = findEntry(root, selectedId);
  if (!selected) return null;
  const rootPosition = positions.find(entry => entry.node.id === root.id);
  if (!selected.parent) {
    const direction = ({ ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] } as Record<string, number[]>)[key];
    if (!rootPosition || !direction) return null;
    const candidates = root.children.flatMap((child, order) => {
      const position = positions.find(entry => entry.node.id === child.id);
      if (!position) return [];
      const dx = position.x - rootPosition.x, dy = position.y - rootPosition.y;
      const projection = dx * direction[0] + dy * direction[1];
      if (projection <= 1e-5) return [];
      const distance = Math.hypot(dx, dy);
      return [{ id: child.id, order, distance, alignment: projection / distance }];
    }).sort((a, b) => b.alignment - a.alignment || a.distance - b.distance || a.order - b.order);
    return candidates.length ? findEntry(root, candidates[0].id) : null;
  }
  const selectedPosition = positions.find(entry => entry.node.id === selectedId);
  const aboveRoot = !!selected.parent && !!rootPosition && !!selectedPosition && selectedPosition.y < rootPosition.y - 1e-5;
  const parentKey = aboveRoot ? "ArrowDown" : "ArrowUp";
  const childKey = aboveRoot ? "ArrowUp" : "ArrowDown";
  let target: OrganizerNode | undefined;
  if (key === parentKey) target = selected.parent ?? undefined;
  else if (key === childKey) target = selected.node.children[Math.floor((selected.node.children.length - 1) / 2)];
  else if ((key === "ArrowLeft" || key === "ArrowRight") && selected.parent) {
    const siblings = selected.parent.children;
    const reference = selected.parent.id === root.id
      ? selectedPosition
      : positions.find(entry => entry.node.id === selected.parent!.id);
    const belowRoot = !!rootPosition && !!reference && reference.y > rootPosition.y + 1e-5;
    const offset = (key === "ArrowLeft" ? -1 : 1) * (belowRoot ? -1 : 1);
    target = siblings[(selected.index + offset + siblings.length) % siblings.length];
  }
  return target && target.id !== selectedId ? findEntry(root, target.id) : null;
}

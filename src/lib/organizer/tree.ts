import type { OrganizerNode, TreeEntry, Point, LayoutEntry, RadialTreeLayout } from './types';

export const ELEMENT_TEXT_LIMIT = 4096;
export const GRAPH_ROOT_RADIUS = 24;

export function normalizeElementText(value: string, fallback = 'Untitled'): string {
  return (value.trim() || fallback).slice(0, ELEMENT_TEXT_LIMIT);
}

export function newNodeId(existing: Iterable<string> = []): string {
  const cryptoObject = globalThis.crypto;
  if (cryptoObject?.randomUUID) {
    const id = cryptoObject.randomUUID();
    if (!Array.from(existing).includes(id)) return id;
  }
  const used = new Set(existing);
  let number = 1;
  while (used.has(`node-${number}`)) number += 1;
  return `node-${number}`;
}

export function createNode(name = 'Untitled', children: OrganizerNode[] = [], id?: string): OrganizerNode {
  return { id: id ?? newNodeId(), name: normalizeElementText(name), children: [...children] };
}

export function flattenTree(node: OrganizerNode, parent: OrganizerNode | null = null, depth = 0, path: OrganizerNode[] = []): TreeEntry[] {
  const currentPath = [...path, node];
  const entry = { node, parent, depth, path: currentPath, index: 0 };
  return [entry, ...node.children.flatMap((child, index) => flattenTreeWithIndex(child, node, depth + 1, currentPath, index))];
}

function flattenTreeWithIndex(node: OrganizerNode, parent: OrganizerNode, depth: number, path: OrganizerNode[], index: number): TreeEntry[] {
  const currentPath = [...path, node];
  const entry = { node, parent, depth, path: currentPath, index };
  return [entry, ...node.children.flatMap((child, childIndex) => flattenTreeWithIndex(child, node, depth + 1, currentPath, childIndex))];
}

export function findEntry(root: OrganizerNode, id: string): TreeEntry | null {
  return flattenTree(root).find((entry) => entry.node.id === id) ?? null;
}
export function voronoiPathForSelection(root: OrganizerNode, id: string): OrganizerNode[] {
  const entry = findEntry(root, id);
  if (!entry) return [root];
  return entry.parent ? entry.path.slice(0, -1) : entry.path;
}
export function findNode(root: OrganizerNode, id: string): OrganizerNode | null { return findEntry(root, id)?.node ?? null; }
export function visibleItems(node: OrganizerNode): OrganizerNode[] { return [node, ...node.children]; }

export function highestLegacyId(root: OrganizerNode): number {
  return flattenTree(root).reduce((highest, { node }) => {
    const match = /(\d+)$/.exec(node.id);
    return Math.max(highest, match ? Number(match[1]) : 0);
  }, 0);
}
export const highestNodeNumber = highestLegacyId;

export function normalizeNode(value: unknown, ids = new Set<string>()): OrganizerNode {
  if (!value || typeof value !== 'object') throw new Error('Invalid organizer node');
  const candidate = value as Partial<OrganizerNode>;
  if (typeof candidate.name !== 'string') throw new Error('Invalid organizer node');
  let id = typeof candidate.id === 'string' && candidate.id ? candidate.id : newNodeId(ids);
  if (ids.has(id)) id = newNodeId(ids);
  ids.add(id);
  const children = Array.isArray(candidate.children) ? candidate.children.map((child) => normalizeNode(child, ids)) : [];
  return { id, name: normalizeElementText(candidate.name), children };
}

export function cloneTree(root: OrganizerNode): OrganizerNode {
  return { id: root.id, name: root.name, children: root.children.map(cloneTree) };
}

export function collectNodeIds(roots: OrganizerNode[]): Set<string> {
  return new Set(roots.flatMap((root) => flattenTree(root).map(({ node }) => node.id)));
}

export function cloneTreeWithFreshIds(root: OrganizerNode, existingIds: Iterable<string> = []): OrganizerNode {
  const usedIds = new Set(existingIds);
  const clone = (node: OrganizerNode): OrganizerNode => {
    const id = newNodeId(usedIds);
    usedIds.add(id);
    return { id, name: node.name, children: node.children.map(clone) };
  };
  return clone(root);
}

export function duplicateTree(root: OrganizerNode, workspaceTrees: OrganizerNode[]): OrganizerNode {
  const duplicate = cloneTreeWithFreshIds(root, collectNodeIds(workspaceTrees));
  duplicate.name = normalizeElementText(`${root.name} copy`);
  return duplicate;
}

export function importGuestAsBranch(accountRoot: OrganizerNode, guestRoot: OrganizerNode): OrganizerNode {
  const usedIds = new Set(flattenTree(accountRoot).map(({ node }) => node.id));
  const cloneWithFreshIds = (node: OrganizerNode): OrganizerNode => {
    const id = newNodeId(usedIds);
    usedIds.add(id);
    return { id, name: node.name, children: node.children.map(cloneWithFreshIds) };
  };
  const branch: OrganizerNode = {
    id: newNodeId(usedIds),
    name: "Imported guest workspace",
    children: [cloneWithFreshIds(guestRoot)],
  };
  accountRoot.children.push(branch);
  return branch;
}

export function addChild(parent: OrganizerNode, name = 'Untitled', id?: string): OrganizerNode {
  const child = createNode(name, [], id);
  parent.children.push(child);
  return child;
}
export function insertSibling(root: OrganizerNode, siblingOf: string, name = 'Untitled', id?: string): OrganizerNode | null {
  const entry = findEntry(root, siblingOf);
  if (!entry?.parent) return null;
  const child = createNode(name, [], id);
  entry.parent.children.splice(entry.index + 1, 0, child);
  return child;
}
export function connectedIds(entry: TreeEntry): string[] { return [...(entry.parent ? [entry.parent.id] : []), ...entry.node.children.map((child) => child.id)]; }

export function radialTreeLayout(root: OrganizerNode, width: number, height: number): RadialTreeLayout {
  const entries = flattenTree(root);
  const byId = new Map(entries.map((entry) => [entry.node.id, { ...entry, x: 0, y: 0, angle: 0, radius: 0 } as LayoutEntry]));
  const leaves = new Map<string, number>();
  const count = (node: OrganizerNode): number => { const value = node.children.length ? node.children.reduce((sum, child) => sum + count(child), 0) : 1; leaves.set(node.id, value); return value; };
  count(root);
  const maxDepth = Math.max(1, ...entries.map((entry) => entry.depth));
  const centerX = width / 2, centerY = height / 2;
  const outerRadiusX = Math.max(90, width / 2 - Math.min(120, width * .15));
  const outerRadiusY = Math.max(90, height / 2 - Math.min(90, height * .14));
  const place = (node: OrganizerNode, start: number, end: number, depth: number) => {
    const entry = byId.get(node.id)!; const angle = (start + end) / 2; const radius = depth / maxDepth;
    Object.assign(entry, { angle, radius, x: centerX + Math.cos(angle) * radius * outerRadiusX, y: centerY + Math.sin(angle) * radius * outerRadiusY });
    const clockwise = depth === 0 || entry.y <= centerY + GRAPH_ROOT_RADIUS;
    let cursor = clockwise ? start : end; const total = leaves.get(node.id)!;
    node.children.forEach((child) => {
      const span = (end - start) * leaves.get(child.id)! / total;
      const childStart = clockwise ? cursor : cursor - span;
      const childEnd = clockwise ? cursor + span : cursor;
      place(child, childStart, childEnd, depth + 1);
      cursor += clockwise ? span : -span;
    });
  };
  place(root, -Math.PI / 2, Math.PI * 3 / 2, 0);
  const nodes = entries.map(({ node }) => byId.get(node.id)!);
  return { nodes, links: nodes.filter((entry) => entry.parent).map((target) => ({ source: byId.get(target.parent!.id)!, target })), centerX, centerY, outerRadiusX, outerRadiusY };
}

export function directionalConnectedCandidates(selected: LayoutEntry, all: LayoutEntry[], direction: Point): LayoutEntry[] {
  const allowed = new Set(connectedIds(selected));
  return all.map((entry, treeOrder) => ({ entry, treeOrder, dx: entry.x - selected.x, dy: entry.y - selected.y }))
    .filter(({ entry, dx, dy }) => entry !== selected && allowed.has(entry.node.id) && dx * direction.x + dy * direction.y > 1e-5)
    .map(({ entry, treeOrder, dx, dy }) => { const distance = Math.hypot(dx, dy); return { entry, treeOrder, distance, alignment: (dx * direction.x + dy * direction.y) / distance }; })
    .sort((a, b) => b.alignment - a.alignment || a.distance - b.distance || a.treeOrder - b.treeOrder).map(({ entry }) => entry);
}
export function cycleConnected(selected: LayoutEntry, all: LayoutEntry[], direction: Point, cycleIndex = 0): LayoutEntry | null {
  const candidates = directionalConnectedCandidates(selected, all, direction);
  return candidates.length ? candidates[cycleIndex % candidates.length] : null;
}

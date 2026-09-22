import { flattenTree, graphNodeLabelLines } from "../../lib/organizer";
import type { OrganizerNode, Point } from "../../lib/organizer";

export type LayoutKind = "tidy" | "mindmap" | "balloon" | "spring" | "planar-spring";
export const layoutOptions: { kind: LayoutKind; name: string; hint: string }[] = [
  { kind: "tidy", name: "Compact tidy tree", hint: "Subtrees packed together, top to bottom." },
  { kind: "mindmap", name: "Two-sided tidy tree", hint: "Branches balanced on both sides of the root." },
  { kind: "balloon", name: "Balloon tree", hint: "Children arranged around their own parents." },
  { kind: "spring", name: "Standard springs", hint: "Unrestricted spring comparison: connections may cross." },
  { kind: "planar-spring", name: "Crossing-preserving springs", hint: "Spring spacing with crossing and overlap checks." },
];
export interface Footprint { left: number; right: number; top: number; bottom: number }
export interface LayoutNode extends Point { id: string; box: Footprint }
export type Edge = [number, number];
export interface Drawing { nodes: LayoutNode[]; edges: Edge[] }
export interface LayoutResult extends Drawing { fallback: boolean }
export type Footprints = Record<string, Footprint>;
export interface LayoutRequest { root: OrganizerNode; kind: LayoutKind; footprints: Footprints }

/** Includes the selected circle, text halo, and 6px on each side (12px clearance). */
export function footprintsFor(root: OrganizerNode, measure = (text: string) => Array.from(text).length * 8): Footprints {
  return Object.fromEntries(flattenTree(root).map(({ node, depth }) => {
    const lines = graphNodeLabelLines(node.name);
    const radius = depth === 0 ? 24 : 19;
    const halfWidth = Math.max(radius + 6, ...lines.map(line => measure(line) / 2 + 2)) + 6;
    return [node.id, { left: -halfWidth, right: halfWidth, top: -radius - 12, bottom: (depth === 0 ? 39 : 34) + (lines.length > 1 ? 14 : 7) + 8 }];
  }));
}

function drawing(root: OrganizerNode, positions: Map<string, Point>, footprints: Footprints): Drawing {
  const entries = flattenTree(root), indices = new Map(entries.map((entry, i) => [entry.node.id, i]));
  return { nodes: entries.map(({ node }) => ({ id: node.id, ...positions.get(node.id)!, box: footprints[node.id] })),
    edges: entries.flatMap((entry, i) => entry.parent ? [[indices.get(entry.parent.id)!, i] as Edge] : []) };
}

/** Merge depth contours, allowing deeper branches to occupy gaps left by shorter ones. */
export function tidy(root: OrganizerNode, footprints: Footprints, horizontal = false): Drawing {
  type Packed = { positions: Map<string, Point>; low: number[]; high: number[] };
  const entries = flattenTree(root);
  const layers: number[] = [0];
  const maxDepth = Math.max(...entries.map(e => e.depth));
  for (let level = 1; level <= maxDepth; level++) {
    const before = Math.max(...entries.filter(e => e.depth === level - 1).map(e => horizontal ? footprints[e.node.id].right : footprints[e.node.id].bottom));
    const after = Math.max(...entries.filter(e => e.depth === level).map(e => horizontal ? -footprints[e.node.id].left : -footprints[e.node.id].top));
    layers[level] = layers[level - 1] + Math.max(100, before + after + 20);
  }
  const pack = (node: OrganizerNode, depth: number): Packed => {
    const positions = new Map<string, Point>();
    const low: number[] = [], high: number[] = [], childCenters: number[] = [];
    for (const child of node.children) {
      const branch = pack(child, depth + 1);
      let shift = 0;
      for (let d = 0; d < branch.low.length; d++) if (high[d] !== undefined) shift = Math.max(shift, high[d] + 20 - branch.low[d]);
      childCenters.push(shift);
      for (const [id, point] of branch.positions) positions.set(id, { x: point.x + shift, y: point.y });
      branch.low.forEach((v, d) => { low[d] = Math.min(low[d] ?? Infinity, v + shift); high[d] = Math.max(high[d] ?? -Infinity, branch.high[d] + shift); });
    }
    const center = childCenters.length ? (childCenters[0] + childCenters[childCenters.length - 1]) / 2 : 0;
    for (const point of positions.values()) point.x -= center;
    positions.set(node.id, { x: 0, y: layers[depth] });
    const box = footprints[node.id];
    return { positions, low: [horizontal ? box.top : box.left, ...low.map(v => v - center)], high: [horizontal ? box.bottom : box.right, ...high.map(v => v - center)] };
  };
  const result = pack(root, 0).positions;
  if (horizontal) for (const point of result.values()) [point.x, point.y] = [point.y, point.x];
  return drawing(root, result, footprints);
}

export function mindmap(root: OrganizerNode, footprints: Footprints): Drawing {
  const sides: OrganizerNode[][] = [[], []], weight = [0, 0];
  for (const child of root.children) {
    const side = weight[0] <= weight[1] ? 0 : 1;
    sides[side].push(child); weight[side] += flattenTree(child).length;
  }
  const positions = new Map<string, Point>([[root.id, { x: 0, y: 0 }]]);
  sides.forEach((children, side) => {
    const branch = tidy({ ...root, children }, footprints, true);
    for (const node of branch.nodes) positions.set(node.id, { x: node.x * (side === 0 ? 1 : -1), y: node.y });
  });
  return drawing(root, positions, footprints);
}

/** Pack subtree disks in outward-facing fans; disks reserve room for the entire branch. */
export function balloon(root: OrganizerNode, footprints: Footprints): Drawing {
  type Balloon = { positions: Map<string, Point>; radius: number };
  const size = (id: string) => { const b = footprints[id]; return Math.hypot(Math.max(-b.left, b.right), Math.max(-b.top, b.bottom)); };
  const pack = (node: OrganizerNode, isRoot = false): Balloon => {
    const positions = new Map<string, Point>([[node.id, { x: 0, y: 0 }]]), ownRadius = size(node.id);
    if (!node.children.length) return { positions, radius: ownRadius };
    const children = node.children.map(child => pack(child));
    const total = children.reduce((sum, child) => sum + child.radius, 0);
    const sector = isRoot ? Math.PI * 2 : Math.PI * .9;
    let cursor = -sector / 2;
    const angles = children.map(child => { const span = sector * child.radius / total; const angle = cursor + span / 2; cursor += span; return angle; });
    let distance = Math.max(90, ...children.map(child => ownRadius + child.radius + 20));
    if (!isRoot) distance = Math.max(distance, ...children.map((child, i) => (ownRadius + child.radius + 20) / Math.cos(angles[i])));
    for (let i = 0; i < children.length; i++) for (let j = i + 1; j < children.length; j++) {
      distance = Math.max(distance, (children[i].radius + children[j].radius + 20) / (2 * Math.abs(Math.sin((angles[i] - angles[j]) / 2))));
    }
    // Leave every sibling's disk clear of the connections from this parent.
    for (let attempt = 0; attempt < 30; attempt++) {
      const centers = angles.map(a => ({ x: Math.cos(a) * distance, y: Math.sin(a) * distance }));
      const blocked = centers.some((end, i) => centers.some((center, j) => {
        if (i === j) return false;
        const t = Math.max(0, Math.min(1, (center.x * end.x + center.y * end.y) / (distance * distance)));
        return Math.hypot(center.x - end.x * t, center.y - end.y * t) < children[j].radius + 12;
      }));
      if (!blocked) break;
      distance *= 1.15;
    }
    let radius = ownRadius;
    children.forEach((child, i) => {
      const c = Math.cos(angles[i]), s = Math.sin(angles[i]);
      for (const [id, point] of child.positions) {
        const x = c * (point.x + distance) - s * point.y, y = s * (point.x + distance) + c * point.y;
        positions.set(id, { x, y }); radius = Math.max(radius, Math.hypot(x, y) + size(id));
      }
    });
    return { positions, radius };
  };
  return drawing(root, pack(root, true).positions, footprints);
}

const EPS = 1e-7;
const cross = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
function onSegment(a: Point, b: Point, p: Point): boolean {
  return Math.abs(cross(a, b, p)) < EPS && p.x >= Math.min(a.x, b.x) - EPS && p.x <= Math.max(a.x, b.x) + EPS && p.y >= Math.min(a.y, b.y) - EPS && p.y <= Math.max(a.y, b.y) + EPS;
}
export function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b);
  return ((abC > EPS && abD < -EPS || abC < -EPS && abD > EPS) && (cdA > EPS && cdB < -EPS || cdA < -EPS && cdB > EPS)) || onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b);
}
export function edgesCross(drawing: Drawing, first: Edge, second: Edge): boolean {
  const shared = first.find(i => second.includes(i));
  if (shared !== undefined) {
    const a = drawing.nodes[shared], b = drawing.nodes[first.find(i => i !== shared)!], c = drawing.nodes[second.find(i => i !== shared)!];
    return Math.abs(cross(a, b, c)) < EPS && (b.x - a.x) * (c.x - a.x) + (b.y - a.y) * (c.y - a.y) > 0;
  }
  return segmentsIntersect(drawing.nodes[first[0]], drawing.nodes[first[1]], drawing.nodes[second[0]], drawing.nodes[second[1]]);
}
function absoluteBox(node: LayoutNode): Footprint { return { left: node.x + node.box.left, right: node.x + node.box.right, top: node.y + node.box.top, bottom: node.y + node.box.bottom }; }
function hitsBox(a: Point, b: Point, box: Footprint): boolean {
  let low = 0, high = 1;
  for (const [start, delta, min, max] of [[a.x, b.x - a.x, box.left, box.right], [a.y, b.y - a.y, box.top, box.bottom]]) {
    if (Math.abs(delta) < EPS) { if (start < min || start > max) return false; }
    else { const u = (min - start) / delta, v = (max - start) / delta; low = Math.max(low, Math.min(u, v)); high = Math.min(high, Math.max(u, v)); }
    if (low > high) return false;
  }
  return true;
}

/** When moved is supplied, validate only relationships affected by that node. */
export function isValid(drawing: Drawing, moved?: number): boolean {
  const { nodes, edges } = drawing, boxes = nodes.map(absoluteBox);
  if (nodes.some(n => !Number.isFinite(n.x) || !Number.isFinite(n.y))) return false;
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    if (moved !== undefined && i !== moved && j !== moved) continue;
    const a = boxes[i], b = boxes[j];
    if (a.left < b.right - EPS && a.right > b.left + EPS && a.top < b.bottom - EPS && a.bottom > b.top + EPS) return false;
  }
  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i], affected = moved === undefined || edge.includes(moved);
    for (let j = i + 1; j < edges.length; j++) if ((affected || edges[j].includes(moved!)) && edgesCross(drawing, edge, edges[j])) return false;
    for (let j = 0; j < nodes.length; j++) if (!edge.includes(j) && (affected || j === moved) && hitsBox(nodes[edge[0]], nodes[edge[1]], boxes[j])) return false;
  }
  return true;
}

/** A tidy construction is planar; scaling resolves finite node/label clearances. */
export function safeTidy(root: OrganizerNode, footprints: Footprints): Drawing {
  const result = tidy(root, footprints);
  for (let attempt = 0; attempt < 48; attempt++) {
    if (isValid(result)) return result;
    for (const node of result.nodes) { node.x *= 1.25; node.y *= 1.25; }
  }
  throw new Error("Unable to produce a validated tree layout");
}

export function springs(seed: Drawing, constrained: boolean): Drawing {
  const result: Drawing = { nodes: seed.nodes.map(node => ({ ...node })), edges: seed.edges };
  const velocity = result.nodes.map(() => ({ x: 0, y: 0 }));
  for (let iteration = 0; iteration < 300; iteration++) {
    const { nodes } = result, force = nodes.map(() => ({ x: 0, y: 0 }));
    const center = nodes.reduce((p, n) => ({ x: p.x + n.x / nodes.length, y: p.y + n.y / nodes.length }), { x: 0, y: 0 });
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      let dx = nodes[j].x - nodes[i].x, dy = nodes[j].y - nodes[i].y;
      if (Math.hypot(dx, dy) < .01) { dx = (j - i) % 2 ? .1 : -.1; dy = .1; }
      const distance = Math.max(1, Math.hypot(dx, dy));
      let strength = 4500 / (distance * distance);
      const a = absoluteBox(nodes[i]), b = absoluteBox(nodes[j]);
      const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left), overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (overlapX > 0 && overlapY > 0) strength += Math.min(overlapX, overlapY) * .8;
      const fx = dx / distance * strength, fy = dy / distance * strength;
      force[i].x -= fx; force[i].y -= fy; force[j].x += fx; force[j].y += fy;
    }
    for (const [i, j] of result.edges) {
      const dx = nodes[j].x - nodes[i].x, dy = nodes[j].y - nodes[i].y, distance = Math.max(.01, Math.hypot(dx, dy));
      const strength = (distance - 90) * .08;
      force[i].x += dx / distance * strength; force[i].y += dy / distance * strength;
      force[j].x -= dx / distance * strength; force[j].y -= dy / distance * strength;
    }
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i], old = { x: node.x, y: node.y };
      const v = velocity[i];
      v.x = (v.x + (force[i].x + (center.x - node.x) * .002) * .2) * .75;
      v.y = (v.y + (force[i].y + (center.y - node.y) * .002) * .2) * .75;
      const limit = Math.min(1, 8 / (Math.hypot(v.x, v.y) || 1));
      let accepted = false;
      for (let step = 0; step < (constrained ? 10 : 1); step++) {
        node.x = old.x + v.x * limit / 2 ** step; node.y = old.y + v.y * limit / 2 ** step;
        if (!constrained || isValid(result, i)) { accepted = true; break; }
      }
      if (!accepted) { Object.assign(node, old); v.x = 0; v.y = 0; }
    }
  }
  return result;
}

/** Disk packing is conservative. Pull whole balloons inward without changing their shapes. */
function compactBalloons(root: OrganizerNode, result: Drawing): void {
  const entries = flattenTree(root);
  const branches = result.edges.map(([parent, child]) => ({ parent, child,
    indices: entries.flatMap((entry, index) => entry.path.some(n => n.id === result.nodes[child].id) ? [index] : []) }));
  for (let pass = 0; pass < 3; pass++) for (const { parent, child, indices } of [...branches].reverse()) {
    const source = result.nodes[parent], target = result.nodes[child];
    const distance = Math.hypot(target.x - source.x, target.y - source.y);
    if (distance <= 90) continue;
    const dx = (source.x - target.x) / distance, dy = (source.y - target.y) / distance;
    const original = indices.map(i => ({ x: result.nodes[i].x, y: result.nodes[i].y }));
    let low = 0, high = distance - 90;
    const apply = (offset: number) => indices.forEach((i, j) => { result.nodes[i].x = original[j].x + dx * offset; result.nodes[i].y = original[j].y + dy * offset; });
    for (let attempt = 0; attempt < 12; attempt++) {
      const step = (low + high) / 2;
      apply(step);
      if (isValid(result)) low = step; else high = step;
    }
    apply(low);
  }
}

export function computeLayout({ root, kind, footprints }: LayoutRequest): LayoutResult {
  let candidate: Drawing;
  if (kind === "spring" || kind === "planar-spring") candidate = springs(safeTidy(root, footprints), kind === "planar-spring");
  else candidate = kind === "balloon" ? balloon(root, footprints) : kind === "mindmap" ? mindmap(root, footprints) : tidy(root, footprints);
  // Packing contours separate nodes; fan-out edges can need additional label clearance.
  // Retain the chosen arrangement where uniform spacing can solve that issue.
  if (kind !== "spring" && kind !== "planar-spring" && !candidate.edges.some((edge, i) => candidate.edges.slice(i + 1).some(other => edgesCross(candidate, edge, other)))) {
    for (let attempt = 0; attempt < 24 && !isValid(candidate); attempt++) {
      for (const node of candidate.nodes) { node.x *= 1.1; node.y *= 1.1; }
    }
  }
  if (kind !== "spring" && !isValid(candidate)) return { ...safeTidy(root, footprints), fallback: true };
  if (kind === "balloon") compactBalloons(root, candidate);
  return { ...candidate, fallback: false };
}

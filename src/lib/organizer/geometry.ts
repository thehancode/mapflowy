import type { Point, Polygon } from './types';

export type ViewportEdge = 'top' | 'right' | 'bottom' | 'left';

function polygonPath(points: Polygon, radius: number, shouldRound: (point: Point) => boolean): string {
  if (points.length < 3) return '';
  const toward = (from: Point, to: Point) => {
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    const fraction = length ? Math.min(Math.max(0, radius), length / 2) / length : 0;
    return `${from.x + (to.x - from.x) * fraction} ${from.y + (to.y - from.y) * fraction}`;
  };
  return points.map((point, index) => {
    if (!shouldRound(point)) return `${index ? 'L' : 'M'} ${point.x} ${point.y}`;
    const previous = points[(index + points.length - 1) % points.length];
    const next = points[(index + 1) % points.length];
    return `${index ? 'L' : 'M'} ${toward(point, previous)} Q ${point.x} ${point.y} ${toward(point, next)}`;
  }).join(' ') + ' Z';
}

export function roundedPolygonPath(points: Polygon, radius = 24): string {
  return polygonPath(points, radius, () => true);
}

export function viewportEdgeOverlayPath(polygon: Polygon, edges: readonly ViewportEdge[], width: number, height: number, thickness = 80, radius = 12): string {
  if (!edges.length) return '';
  const edgeSet = new Set(edges);
  let interior = polygon;
  if (edgeSet.has('top')) interior = clipPolygon(interior, 0, -1, -thickness);
  if (edgeSet.has('right')) interior = clipPolygon(interior, 1, 0, width - thickness);
  if (edgeSet.has('bottom')) interior = clipPolygon(interior, 0, 1, height - thickness);
  if (edgeSet.has('left')) interior = clipPolygon(interior, -1, 0, -thickness);
  if (interior.length < 3 || polygonArea(interior) < 1) return roundedPolygonPath(polygon, radius);

  const epsilon = 1e-5;
  const isInnerCorner = (point: Point) => {
    const onVerticalInset = edgeSet.has('left') && Math.abs(point.x - thickness) <= epsilon
      || edgeSet.has('right') && Math.abs(point.x - (width - thickness)) <= epsilon;
    const onHorizontalInset = edgeSet.has('top') && Math.abs(point.y - thickness) <= epsilon
      || edgeSet.has('bottom') && Math.abs(point.y - (height - thickness)) <= epsilon;
    return onVerticalInset && onHorizontalInset;
  };
  return `${roundedPolygonPath(polygon, radius)} ${polygonPath(interior, radius, isInnerCorner)}`;
}

export function viewportEdgeBand(polygon: Polygon, edge: ViewportEdge, width: number, height: number, thickness = 80): Polygon {
  const edges = viewportEdges(polygon, width, height);
  if (edge === 'top') return clipPolygon(polygon, 0, 1, thickness);
  if (edge === 'bottom') return clipPolygon(polygon, 0, -1, thickness - height);
  let band = edge === 'left' ? clipPolygon(polygon, 1, 0, thickness) : clipPolygon(polygon, -1, 0, thickness - width);
  if (edges.includes('top')) band = clipPolygon(band, 0, -1, -thickness);
  if (edges.includes('bottom')) band = clipPolygon(band, 0, 1, height - thickness);
  return band;
}

export function polygonBottomBand(polygon: Polygon, thickness = 80): Polygon {
  if (!polygon.length) return [];
  const bottom = Math.max(...polygon.map(({ y }) => y));
  return clipPolygon(polygon, 0, -1, thickness - bottom);
}

export function circleLayout(count: number): Point[] {
  if (count <= 0) return [];
  if (count === 1) return [{ x: .5, y: .5 }];
  const radius = count === 2 ? .27 : Math.min(.38, .29 + count * .008);
  return Array.from({ length: count }, (_, index) => { const angle = -Math.PI / 2 + index * Math.PI * 2 / count; return { x: .5 + Math.cos(angle) * radius, y: .5 + Math.sin(angle) * radius }; });
}
export function clipPolygon(polygon: Polygon, nx: number, ny: number, constant: number): Polygon {
  const output: Point[] = [];
  for (let i = 0; i < polygon.length; i += 1) {
    const current = polygon[i], previous = polygon[(i + polygon.length - 1) % polygon.length];
    const inside = (point: Point) => point.x * nx + point.y * ny <= constant + 1e-7;
    const currentInside = inside(current), previousInside = inside(previous);
    if (currentInside !== previousInside) { const dx = current.x - previous.x, dy = current.y - previous.y, denominator = dx * nx + dy * ny; if (Math.abs(denominator) > 1e-9) { const amount = (constant - previous.x * nx - previous.y * ny) / denominator; output.push({ x: previous.x + amount * dx, y: previous.y + amount * dy }); } }
    if (currentInside) output.push(current);
  }
  return output;
}
export function voronoiPolygons<T extends Point & { id: string }>(sites: T[], width: number, height: number): Polygon[] {
  return sites.map((site) => { let polygon: Polygon = [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }]; sites.forEach((other) => { if (site.id === other.id) return; const nx = other.x - site.x, ny = other.y - site.y; polygon = clipPolygon(polygon, nx, ny, (other.x ** 2 + other.y ** 2 - site.x ** 2 - site.y ** 2) / 2); }); return polygon; });
}
export function viewportEdges(polygon: Polygon, width: number, height: number, epsilon = 1): ViewportEdge[] {
  const edges: ViewportEdge[] = [];
  const hasSpan = (points: Point[], axis: 'x' | 'y') => points.length >= 2 && Math.max(...points.map((point) => point[axis])) - Math.min(...points.map((point) => point[axis])) > epsilon;
  if (hasSpan(polygon.filter(({ y }) => y <= epsilon), 'x')) edges.push('top');
  if (hasSpan(polygon.filter(({ x }) => x >= width - epsilon), 'y')) edges.push('right');
  if (hasSpan(polygon.filter(({ y }) => y >= height - epsilon), 'x')) edges.push('bottom');
  if (hasSpan(polygon.filter(({ x }) => x <= epsilon), 'y')) edges.push('left');
  return edges;
}
export function viewportEdgeSpan(polygon: Polygon, edge: ViewportEdge, width: number, height: number, epsilon = 1): number {
  const horizontal = edge === 'top' || edge === 'bottom';
  const points = polygon.filter((point) => edge === 'top' ? point.y <= epsilon : edge === 'right' ? point.x >= width - epsilon : edge === 'bottom' ? point.y >= height - epsilon : point.x <= epsilon);
  const values = points.map((point) => horizontal ? point.x : point.y);
  return values.length < 2 ? 0 : Math.max(...values) - Math.min(...values);
}
export function polygonArea(points: Polygon): number { return Math.abs(points.reduce((sum, point, i) => { const next = points[(i + 1) % points.length]; return sum + point.x * next.y - next.x * point.y; }, 0) / 2); }
export function polygonCentroid(points: Polygon): Point { if (points.length < 3) return points[0] ?? { x: 0, y: 0 }; let crossSum = 0, x = 0, y = 0; points.forEach((point, i) => { const next = points[(i + 1) % points.length], cross = point.x * next.y - next.x * point.y; crossSum += cross; x += (point.x + next.x) * cross; y += (point.y + next.y) * cross; }); return Math.abs(crossSum) < 1e-9 ? points[0] : { x: x / (3 * crossSum), y: y / (3 * crossSum) }; }
export function fitLabel(name: string, maxWidth: number): { text: string; size: number } { const text = name.length > 28 ? `${name.slice(0, 26)}…` : name; return { text, size: Math.max(11, Math.min(18, maxWidth / Math.max(text.length * .58, 1))) }; }
export function radialLinkPath(source: { x: number; y: number; angle: number; radius: number }, target: typeof source, centerX: number, centerY: number, outerRadiusX: number, outerRadiusY: number): string { const middle = (source.radius + target.radius) / 2; return `M ${source.x.toFixed(2)} ${source.y.toFixed(2)} C ${(centerX + Math.cos(source.angle) * middle * outerRadiusX).toFixed(2)} ${(centerY + Math.sin(source.angle) * middle * outerRadiusY).toFixed(2)}, ${(centerX + Math.cos(target.angle) * middle * outerRadiusX).toFixed(2)} ${(centerY + Math.sin(target.angle) * middle * outerRadiusY).toFixed(2)}, ${target.x.toFixed(2)} ${target.y.toFixed(2)}`; }

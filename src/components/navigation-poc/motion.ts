import type { Point } from "../../lib/organizer";

const clamp = (n: number, max: number) => Math.max(0, Math.min(n, Math.max(0, max)));
export function bounded(point: Point, bounds: Point): Point {
  return { x: clamp(point.x, bounds.x), y: clamp(point.y, bounds.y) };
}

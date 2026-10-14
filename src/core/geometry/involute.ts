import type { Vec2 } from '../vec';

/** Point on the involute of a circle of radius rb at roll angle t (starts at (rb, 0), unwinds CCW). */
export function involutePoint(rb: number, t: number): Vec2 {
  const c = Math.cos(t);
  const s = Math.sin(t);
  return { x: rb * (c + t * s), y: rb * (s - t * c) };
}

// Parallel offset of a closed loop to the right of its travel direction (outward for a CCW outer loop).
import { add, cross, dot, rightNormal, scale, type Vec2 } from '../vec';
import { bezierPoint } from './bezier';
import { fitHermite } from './bezier';
import { segEnd, segTangent } from './sample';
import type { Loop, Segment } from './types';

export type OffsetResult = { ok: true; loop: Loop } | { ok: false; error: string; /** smallest inside radius that blocked the offset */ radius?: number };

function offsetSegment(s: Segment, d: number): Segment[] | { error: string; radius: number } {
  if (s.kind === 'line') {
    const n = scale(rightNormal(segTangent(s, 0)), d);
    return [{ kind: 'line', a: add(s.a, n), b: add(s.b, n) }];
  }
  if (s.kind === 'arc') {
    const r = s.end > s.start ? s.r + d : s.r - d;
    if (r <= 1e-6) return { error: `offset ${d.toFixed(3)} mm is larger than a ${s.r.toFixed(3)} mm inside radius`, radius: s.r };
    return [{ ...s, r }];
  }
  const f = (u: number): Vec2 => add(bezierPoint(s.p, u), scale(rightNormal(segTangent(s, Math.min(1, Math.max(0, u)))), d));
  return fitHermite(f, 0, 1, 0.0005);
}

export function offsetLoop(loop: Loop, d: number): OffsetResult {
  if (d === 0) return { ok: true, loop };
  const out: Loop = [];
  for (let i = 0; i < loop.length; i++) {
    const s = loop[i];
    const next = loop[(i + 1) % loop.length];
    const segs = offsetSegment(s, d);
    if (!Array.isArray(segs)) return { ok: false, error: segs.error, radius: segs.radius };
    out.push(...segs);
    const t1 = segTangent(s, 1);
    const t2 = segTangent(next, 0);
    const turn = cross(t1, t2);
    if (Math.abs(turn) < 1e-6 && dot(t1, t2) > 0) continue; // tangent-continuous join
    if (turn < 0) return { ok: false, error: 'kerf offset hit a sharp inside corner; reduce the kerf' };
    // convex corner: bridge the gap with an arc around the original corner point
    const corner = segEnd(s);
    const n1 = rightNormal(t1);
    const n2 = rightNormal(t2);
    const a1 = Math.atan2(n1.y, n1.x);
    let a2 = Math.atan2(n2.y, n2.x);
    while (a2 < a1) a2 += 2 * Math.PI;
    out.push({ kind: 'arc', center: corner, r: d, start: a1, end: a2 });
  }
  return { ok: true, loop: out };
}

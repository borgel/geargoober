import { add, dist, len, norm, polar, rot, sub, type Vec2 } from '../vec';
import { bezierDeriv, bezierPoint, bezierSplit } from './bezier';
import type { Loop, Profile, Segment } from './types';

export function segStart(s: Segment): Vec2 {
  if (s.kind === 'line') return s.a;
  if (s.kind === 'arc') return add(s.center, polar(s.r, s.start));
  return s.p[0];
}

export function segEnd(s: Segment): Vec2 {
  if (s.kind === 'line') return s.b;
  if (s.kind === 'arc') return add(s.center, polar(s.r, s.end));
  return s.p[3];
}

export function segPoint(s: Segment, u: number): Vec2 {
  if (s.kind === 'line') return add(s.a, { x: (s.b.x - s.a.x) * u, y: (s.b.y - s.a.y) * u });
  if (s.kind === 'arc') return add(s.center, polar(s.r, s.start + (s.end - s.start) * u));
  return bezierPoint(s.p, u);
}

/** Unit tangent in traversal direction. */
export function segTangent(s: Segment, u: number): Vec2 {
  if (s.kind === 'line') return norm(sub(s.b, s.a));
  if (s.kind === 'arc') {
    const a = s.start + (s.end - s.start) * u;
    const sign = s.end > s.start ? 1 : -1;
    return { x: -Math.sin(a) * sign, y: Math.cos(a) * sign };
  }
  let d = bezierDeriv(s.p, u);
  if (len(d) < 1e-12) d = sub(bezierPoint(s.p, Math.min(1, u + 1e-6)), bezierPoint(s.p, Math.max(0, u - 1e-6)));
  return norm(d);
}

/** Points along a segment, excluding its end point, within maxErr of the true curve. */
export function sampleSegment(s: Segment, maxErr = 0.001): Vec2[] {
  if (s.kind === 'line') return [s.a];
  if (s.kind === 'arc') {
    const sweep = Math.abs(s.end - s.start);
    const step = 2 * Math.acos(Math.max(-1, 1 - maxErr / s.r));
    const n = Math.max(1, Math.ceil(sweep / step));
    return Array.from({ length: n }, (_, i) => segPoint(s, i / n));
  }
  const out: Vec2[] = [];
  const rec = (p: [Vec2, Vec2, Vec2, Vec2], depth: number) => {
    const chord = dist(p[0], p[3]);
    const dev = (q: Vec2) => {
      if (chord < 1e-12) return dist(q, p[0]);
      const d = sub(p[3], p[0]);
      return Math.abs(d.x * (q.y - p[0].y) - d.y * (q.x - p[0].x)) / chord;
    };
    // control-polygon deviation bounds curve deviation (×3/4)
    if (depth > 18 || 0.75 * Math.max(dev(p[1]), dev(p[2])) <= maxErr) {
      out.push(p[0]);
      return;
    }
    const [a, b] = bezierSplit(p, 0.5);
    rec(a, depth + 1);
    rec(b, depth + 1);
  };
  rec(s.p, 0);
  return out;
}

export function sampleLoop(loop: Loop, maxErr = 0.001): Vec2[] {
  return loop.flatMap((s) => sampleSegment(s, maxErr));
}

// 3-point Gauss–Legendre on [0,1]: exact for the degree-5 integrand of a cubic Bézier.
const GL = [
  { u: 0.5 - Math.sqrt(15) / 10, w: 5 / 18 },
  { u: 0.5, w: 8 / 18 },
  { u: 0.5 + Math.sqrt(15) / 10, w: 5 / 18 },
];

/** ½∮(x dy − y dx) over one segment — exact for every segment kind. */
function segAreaTerm(s: Segment): number {
  if (s.kind === 'line') return (s.a.x * s.b.y - s.b.x * s.a.y) / 2;
  if (s.kind === 'arc') {
    const { center: c, r, start: a, end: b } = s;
    return (r * r * (b - a) + r * c.x * (Math.sin(b) - Math.sin(a)) - r * c.y * (Math.cos(b) - Math.cos(a))) / 2;
  }
  let sum = 0;
  for (const { u, w } of GL) {
    const p = bezierPoint(s.p, u);
    const d = bezierDeriv(s.p, u);
    sum += w * (p.x * d.y - p.y * d.x);
  }
  return sum / 2;
}

/** Exact signed area (positive for CCW). */
export function loopArea(loop: Loop): number {
  return loop.reduce((a, s) => a + segAreaTerm(s), 0);
}

export function profileArea(p: Profile): number {
  return loopArea(p.outer) + p.holes.reduce((s, h) => s + loopArea(h), 0);
}

export function pointInPolygon(pt: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Rotate about the origin by `ang`, then translate. */
export function transformLoop(loop: Loop, ang: number, dx: number, dy: number): Loop {
  const tp = (p: Vec2) => add(rot(p, ang), { x: dx, y: dy });
  return loop.map((s): Segment => {
    if (s.kind === 'line') return { kind: 'line', a: tp(s.a), b: tp(s.b) };
    if (s.kind === 'arc') return { ...s, center: tp(s.center), start: s.start + ang, end: s.end + ang };
    return { kind: 'bezier', p: [tp(s.p[0]), tp(s.p[1]), tp(s.p[2]), tp(s.p[3])] };
  });
}

export function transformProfile(p: Profile, ang: number, dx: number, dy: number): Profile {
  return { outer: transformLoop(p.outer, ang, dx, dy), holes: p.holes.map((h) => transformLoop(h, ang, dx, dy)) };
}

export function reverseSegment(s: Segment): Segment {
  if (s.kind === 'line') return { kind: 'line', a: s.b, b: s.a };
  if (s.kind === 'arc') return { ...s, start: s.end, end: s.start };
  return { kind: 'bezier', p: [s.p[3], s.p[2], s.p[1], s.p[0]] };
}

export function reverseLoop(loop: Loop): Loop {
  return loop.map(reverseSegment).reverse();
}

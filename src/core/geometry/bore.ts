// Shaft bore holes, centered on the origin, clockwise (holes run opposite to the outer loop).
import type { Bore } from '../model';
import { add, dot, len, norm, scale, sub, type Vec2 } from '../vec';
import { reverseLoop } from './sample';
import type { Loop, Segment } from './types';

export interface BoreOptions {
  /** Corner relief radius for hex/square bores. */
  relief: number;
  /** fillet (default): rounded corners. dogbone: cut-outs that clear a sharp-cornered shaft. */
  style?: 'fillet' | 'dogbone';
  /** Shrink the hole by this much on every side (kerf compensation). */
  shrink?: number;
}

/** CCW polygon with every corner rounded to radius r (r = 0 keeps sharp corners). */
function roundedPolygon(verts: Vec2[], r: number): Loop {
  const n = verts.length;
  if (r <= 0) return verts.map((a, i) => ({ kind: 'line', a, b: verts[(i + 1) % n] }));
  const corners = verts.map((v, i) => {
    const d1 = norm(sub(verts[(i - 1 + n) % n], v));
    const d2 = norm(sub(verts[(i + 1) % n], v));
    const half = Math.acos(Math.max(-1, Math.min(1, dot(d1, d2)))) / 2;
    const t = r / Math.tan(half);
    const c = add(v, scale(norm(add(d1, d2)), r / Math.sin(half)));
    const t1 = add(v, scale(d1, t));
    const t2 = add(v, scale(d2, t));
    let a1 = Math.atan2(t1.y - c.y, t1.x - c.x);
    let a2 = Math.atan2(t2.y - c.y, t2.x - c.x);
    while (a2 < a1) a2 += 2 * Math.PI;
    while (a2 - a1 > Math.PI) a1 += 2 * Math.PI;
    return { t1, t2, arc: { kind: 'arc', center: c, r, start: a1, end: a2 } as Segment };
  });
  const loop: Loop = [];
  corners.forEach((c, i) => {
    loop.push(c.arc);
    const next = corners[(i + 1) % n];
    if (len(sub(next.t1, c.t2)) > 1e-12) loop.push({ kind: 'line', a: c.t2, b: next.t1 });
  });
  return loop;
}

/**
 * CCW polygon with a dog-bone at every corner: a circle of radius r through the sharp corner, centered
 * r inside it along the bisector, so a shaft with sharp corners still seats fully.
 */
function dogbonePolygon(verts: Vec2[], r: number): Loop {
  const n = verts.length;
  if (r <= 0) return roundedPolygon(verts, 0);
  const corners = verts.map((v, i) => {
    const d1 = norm(sub(verts[(i - 1 + n) % n], v));
    const d2 = norm(sub(verts[(i + 1) % n], v));
    const out = scale(norm(add(d1, d2)), -1); // bisector pointing away from the hole's interior
    const c = sub(v, scale(out, r));
    const t1 = add(v, scale(d1, -2 * r * dot(d1, out)));
    const t2 = add(v, scale(d2, -2 * r * dot(d2, out)));
    const a1 = Math.atan2(t1.y - c.y, t1.x - c.x);
    const a2 = Math.atan2(t2.y - c.y, t2.x - c.x);
    const av = Math.atan2(v.y - c.y, v.x - c.x);
    const norm2pi = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const ccw = norm2pi(a2 - a1);
    // go the way round that passes through the sharp corner
    const end = norm2pi(av - a1) < ccw ? a1 + ccw : a1 - (2 * Math.PI - ccw);
    return { t1, t2, arc: { kind: 'arc', center: c, r, start: a1, end } as Segment };
  });
  const loop: Loop = [];
  corners.forEach((c, i) => {
    loop.push(c.arc);
    const next = corners[(i + 1) % n];
    if (len(sub(next.t1, c.t2)) > 1e-12) loop.push({ kind: 'line', a: c.t2, b: next.t1 });
  });
  return loop;
}

export function boreLoop(bore: Bore, opts: BoreOptions): Loop {
  const corner = (verts: Vec2[], r: number) => (opts.style === 'dogbone' ? dogbonePolygon(verts, r) : roundedPolygon(verts, r));
  const k = opts.shrink ?? 0;
  const relief = Math.max(0, opts.relief - k);
  switch (bore.kind) {
    case 'round': {
      const r = bore.dia / 2 - k;
      return [
        { kind: 'arc', center: { x: 0, y: 0 }, r, start: 0, end: -Math.PI },
        { kind: 'arc', center: { x: 0, y: 0 }, r, start: -Math.PI, end: -2 * Math.PI },
      ];
    }
    case 'dflat': {
      const r = bore.dia / 2 - k;
      const h = r - bore.flatDepth;
      const w = Math.sqrt(r * r - h * h);
      const phi = Math.atan2(h, w);
      return [
        { kind: 'arc', center: { x: 0, y: 0 }, r, start: phi, end: -Math.PI - phi },
        { kind: 'line', a: { x: -w, y: h }, b: { x: w, y: h } },
      ];
    }
    case 'hex': {
      const R = (bore.acrossFlats - 2 * k) / Math.sqrt(3);
      const verts = Array.from({ length: 6 }, (_, i) => ({ x: R * Math.cos((i * Math.PI) / 3), y: R * Math.sin((i * Math.PI) / 3) }));
      return reverseLoop(corner(verts, relief));
    }
    case 'square': {
      const h = bore.side / 2 - k;
      const verts = [
        { x: -h, y: -h },
        { x: h, y: -h },
        { x: h, y: h },
        { x: -h, y: h },
      ];
      return reverseLoop(corner(verts, relief));
    }
  }
}

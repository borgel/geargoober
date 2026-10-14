// Shaft bore holes, centered on the origin, clockwise (holes run opposite to the outer loop).
import type { Bore } from '../model';
import { add, dot, len, norm, scale, sub, type Vec2 } from '../vec';
import { reverseLoop } from './sample';
import type { Loop, Segment } from './types';

export interface BoreOptions {
  /** Corner relief radius for hex/square bores. */
  relief: number;
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

export function boreLoop(bore: Bore, opts: BoreOptions): Loop {
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
      return reverseLoop(roundedPolygon(verts, relief));
    }
    case 'square': {
      const h = bore.side / 2 - k;
      const verts = [
        { x: -h, y: -h },
        { x: h, y: -h },
        { x: h, y: h },
        { x: -h, y: h },
      ];
      return reverseLoop(roundedPolygon(verts, relief));
    }
  }
}

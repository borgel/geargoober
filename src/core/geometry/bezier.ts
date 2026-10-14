import { add, dist, scale, sub, type Vec2 } from '../vec';
import type { BezierSeg } from './types';

type Ctrl = [Vec2, Vec2, Vec2, Vec2];

export function bezierPoint(p: Ctrl, u: number): Vec2 {
  const w = 1 - u;
  const a = w * w * w;
  const b = 3 * w * w * u;
  const c = 3 * w * u * u;
  const d = u * u * u;
  return { x: a * p[0].x + b * p[1].x + c * p[2].x + d * p[3].x, y: a * p[0].y + b * p[1].y + c * p[2].y + d * p[3].y };
}

export function bezierDeriv(p: Ctrl, u: number): Vec2 {
  const w = 1 - u;
  const a = 3 * w * w;
  const b = 6 * w * u;
  const c = 3 * u * u;
  return {
    x: a * (p[1].x - p[0].x) + b * (p[2].x - p[1].x) + c * (p[3].x - p[2].x),
    y: a * (p[1].y - p[0].y) + b * (p[2].y - p[1].y) + c * (p[3].y - p[2].y),
  };
}

/** Split a cubic at u (de Casteljau). */
export function bezierSplit(p: Ctrl, u: number): [Ctrl, Ctrl] {
  const lerp = (a: Vec2, b: Vec2) => add(a, scale(sub(b, a), u));
  const p01 = lerp(p[0], p[1]);
  const p12 = lerp(p[1], p[2]);
  const p23 = lerp(p[2], p[3]);
  const p012 = lerp(p01, p12);
  const p123 = lerp(p12, p23);
  const mid = lerp(p012, p123);
  return [
    [p[0], p01, p012, mid],
    [mid, p123, p23, p[3]],
  ];
}

function derivative(f: (u: number) => Vec2, u: number, h: number): Vec2 {
  return scale(sub(f(u + h), f(u - h)), 1 / (2 * h));
}

/**
 * Approximate the parametric curve f on [u0, u1] with cubic Bézier spans (Hermite interpolation
 * of value and derivative at each span end), splitting until every span is within `tol` of f.
 */
export function fitHermite(f: (u: number) => Vec2, u0: number, u1: number, tol = 0.001): BezierSeg[] {
  const h = Math.abs(u1 - u0) * 1e-6;
  const out: BezierSeg[] = [];
  const fit = (a: number, b: number, pa: Vec2, pb: Vec2, depth: number) => {
    const span = b - a;
    const da = derivative(f, a, h);
    const db = derivative(f, b, h);
    const ctrl: Ctrl = [pa, add(pa, scale(da, span / 3)), sub(pb, scale(db, span / 3)), pb];
    let err = 0;
    for (let i = 1; i < 16; i++) {
      const s = i / 16;
      err = Math.max(err, dist(bezierPoint(ctrl, s), f(a + s * span)));
    }
    if (err <= tol || depth >= 14) {
      out.push({ kind: 'bezier', p: ctrl });
      return;
    }
    const m = (a + b) / 2;
    const pm = f(m);
    fit(a, m, pa, pm, depth + 1);
    fit(m, b, pm, pb, depth + 1);
  };
  fit(u0, u1, f(u0), f(u1), 0);
  return out;
}

// Involute spur gear outline: tooth 0 centered on +x, CCW, starting at the gap center at −π/z.
import { flankAngleAt, radii, type ToothParams } from '../gearmath';
import { add, len, norm, polar, rot, scale, type Vec2 } from '../vec';
import { fitHermite } from './bezier';
import { transformLoop } from './sample';
import type { ArcSeg, Loop, Segment } from './types';

const FILLET_COEF = 0.38;
const TAU = 2 * Math.PI;

export interface SpurResult {
  loop: Loop;
  pointed: boolean;
  /** Root fillet radius actually used (may be shrunk to fit). */
  filletR: number;
}

const mirror = (p: Vec2): Vec2 => ({ x: p.x, y: -p.y });

function mirrorSeg(s: Segment): Segment {
  if (s.kind === 'line') return { kind: 'line', a: mirror(s.a), b: mirror(s.b) };
  if (s.kind === 'arc') return { ...s, center: mirror(s.center), start: -s.start, end: -s.end };
  return { kind: 'bezier', p: [mirror(s.p[0]), mirror(s.p[1]), mirror(s.p[2]), mirror(s.p[3])] };
}

function reverseSeg(s: Segment): Segment {
  if (s.kind === 'line') return { kind: 'line', a: s.b, b: s.a };
  if (s.kind === 'arc') return { ...s, start: s.end, end: s.start };
  return { kind: 'bezier', p: [s.p[3], s.p[2], s.p[1], s.p[0]] };
}

function bisect(f: (x: number) => number, lo: number, hi: number): number {
  let flo = f(lo);
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const fm = f(mid);
    if (fm === 0) return mid;
    if (fm < 0 === flo < 0) {
      lo = mid;
      flo = fm;
    } else hi = mid;
  }
  return (lo + hi) / 2;
}

export function spurOuterLoop(p: ToothParams): SpurResult {
  const { m, z } = p;
  const { outerR: ra, rootR: rf, baseR: rb } = radii(p);
  const halfGap = Math.PI / z;
  const thetaB = flankAngleAt(p, rb); // flank angle at the base circle

  // Upper flank parameterized by s: s < 0 → radial line at radius rb + s; s ≥ 0 → involute with w = s = t².
  const sMin = rf < rb ? rf - rb : (rf / rb) ** 2 - 1;
  const flank = (s: number): Vec2 => {
    if (s < 0) return polar(rb + s, thetaB);
    const t = Math.sqrt(s);
    return polar(rb * Math.sqrt(1 + s), thetaB - (t - Math.atan(t)));
  };
  // d/ds of the flank (outward); for the involute part dP/dw = rb·(cos t, −sin t)/2 rotated by θb.
  const flankDeriv = (s: number): Vec2 => {
    if (s < 0) return polar(1, thetaB);
    const t = Math.sqrt(s);
    return rot({ x: (rb * Math.cos(t)) / 2, y: (-rb * Math.sin(t)) / 2 }, thetaB);
  };
  const normalIntoGap = (s: number): Vec2 => rot(norm(flankDeriv(s)), Math.PI / 2);

  // Tip: end the flank at the tip circle, or where it crosses the tooth center line if pointed.
  let sTip = (ra / rb) ** 2 - 1;
  let pointed = false;
  if (flankAngleAt(p, ra) <= 0) {
    pointed = true;
    sTip = bisect((s) => Math.atan2(flank(s).y, flank(s).x), Math.max(0, sMin), sTip);
  }

  // Root fillet: circle of radius rFil tangent to the flank and to the root circle.
  let rFil = FILLET_COEF * m;
  let sFil = sMin;
  let center: Vec2 | undefined;
  for (let tries = 0; tries < 30 && rFil > 1e-6; tries++) {
    const g = (s: number) => len(add(flank(s), scale(normalIntoGap(s), rFil))) - (rf + rFil);
    if (g(sTip) > 0 && g(sMin) < 0) {
      const s = bisect(g, sMin, sTip);
      const c = add(flank(s), scale(normalIntoGap(s), rFil));
      if (Math.atan2(c.y, c.x) < halfGap) {
        sFil = s;
        center = c;
        break;
      }
    }
    rFil *= 0.8;
  }
  if (!center) rFil = 0;

  // Build the upper half-tooth outward (root → tip), then mirror for the lower half.
  const upperOut: Segment[] = [];
  let rootAngle: number; // polar angle where the upper side meets the root circle
  if (center) {
    const q = scale(norm(center), rf);
    const pF = flank(sFil);
    const aQ = Math.atan2(q.y - center.y, q.x - center.x);
    let aP = Math.atan2(pF.y - center.y, pF.x - center.x);
    // outward traversal goes root → flank: Q → P, a concave fillet traversed CW in the final CCW loop
    // means CCW here (we reverse later); pick the short sweep from Q to P going CCW.
    while (aP < aQ) aP += TAU;
    while (aP - aQ > TAU) aP -= TAU;
    upperOut.push({ kind: 'arc', center, r: rFil, start: aQ, end: aP } as ArcSeg);
    rootAngle = Math.atan2(q.y, q.x);
  } else {
    rootAngle = Math.atan2(flank(sMin).y, flank(sMin).x);
  }
  if (sFil < 0) upperOut.push({ kind: 'line', a: flank(sFil), b: flank(0) });
  const s0 = Math.max(0, sFil);
  if (sTip > s0) upperOut.push(...fitHermite(flank, s0, sTip, 0.001 * 0.5, flankDeriv));

  // Tooth 0, CCW from the gap center at −π/z.
  const lowerOut = upperOut.map(mirrorSeg); // root → tip on the lower side (traversed CCW already)
  const upperIn = upperOut.map(reverseSeg).reverse(); // tip → root on the upper side
  const tooth: Segment[] = [];
  if (-rootAngle > -halfGap + 1e-12) tooth.push({ kind: 'arc', center: { x: 0, y: 0 }, r: rf, start: -halfGap, end: -rootAngle });
  tooth.push(...lowerOut);
  if (!pointed) {
    const tipA = Math.atan2(flank(sTip).y, flank(sTip).x);
    tooth.push({ kind: 'arc', center: { x: 0, y: 0 }, r: ra, start: -tipA, end: tipA });
  }
  tooth.push(...upperIn);
  if (rootAngle < halfGap - 1e-12) tooth.push({ kind: 'arc', center: { x: 0, y: 0 }, r: rf, start: rootAngle, end: halfGap });

  const loop: Loop = [];
  for (let k = 0; k < z; k++) loop.push(...(k === 0 ? tooth : transformLoop(tooth, (k * TAU) / z, 0, 0)));
  // snap shared endpoints between teeth so the loop closes exactly
  return { loop: snapLoop(loop), pointed, filletR: rFil };
}

/** Make each segment start exactly where the previous one ends (removes float drift from rotation). */
function snapLoop(loop: Loop): Loop {
  return loop.map((s, i) => {
    const prev = loop[(i - 1 + loop.length) % loop.length];
    const e = segEndOf(prev);
    if (s.kind === 'line') return { ...s, a: e };
    if (s.kind === 'bezier') return { kind: 'bezier', p: [e, s.p[1], s.p[2], s.p[3]] };
    return s;
  });
}

function segEndOf(s: Segment): Vec2 {
  if (s.kind === 'line') return s.b;
  if (s.kind === 'arc') return add(s.center, polar(s.r, s.end));
  return s.p[3];
}

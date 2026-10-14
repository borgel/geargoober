// Rack outline in rack-local coordinates: pitch line on y = 0, teeth toward +y,
// tooth k centered at x = (k − (n−1)/2)·πm, ends on half-gaps at x = ±n·πm/2. CCW.
import { add, scale, type Vec2 } from '../vec';
import type { Loop, Segment } from './types';

export interface RackParams {
  m: number;
  n: number;
  paRad: number;
  backlash: number;
  clearanceCoef: number;
  backHeight: number;
}

const FILLET_COEF = 0.38;

const mirrorX = (p: Vec2, cx: number): Vec2 => ({ x: 2 * cx - p.x, y: p.y });

function mirrorSeg(s: Segment, cx: number): Segment {
  if (s.kind === 'line') return { kind: 'line', a: mirrorX(s.a, cx), b: mirrorX(s.b, cx) };
  if (s.kind === 'arc') return { ...s, center: mirrorX(s.center, cx), start: Math.PI - s.start, end: Math.PI - s.end };
  return { kind: 'bezier', p: [mirrorX(s.p[0], cx), mirrorX(s.p[1], cx), mirrorX(s.p[2], cx), mirrorX(s.p[3], cx)] };
}

function reverseSeg(s: Segment): Segment {
  if (s.kind === 'line') return { kind: 'line', a: s.b, b: s.a };
  if (s.kind === 'arc') return { ...s, start: s.end, end: s.start };
  return { kind: 'bezier', p: [s.p[3], s.p[2], s.p[1], s.p[0]] };
}

export function rackOuterLoop(r: RackParams): Loop {
  const { m, n, paRad } = r;
  const p = Math.PI * m;
  const s = p / 2 - r.backlash / 2;
  const ha = m;
  const hf = (1 + r.clearanceCoef) * m;
  const yb = -hf - r.backHeight;
  const L = n * p;
  const tanA = Math.tan(paRad);
  const nrm = { x: Math.cos(paRad), y: Math.sin(paRad) }; // right-flank normal, pointing into the gap

  // Right half of the tooth centered at x = 0: from the gap center (p/2, −hf) leftward to the tip center.
  const half = (y: number) => s / 2 - y * tanA; // flank half-width at height y
  let yTip = ha;
  if (half(ha) <= 0) yTip = s / 2 / tanA; // pointed rack tooth: flanks meet below the tip line
  const rightHalf: Segment[] = [];
  let rFil = FILLET_COEF * m;
  let built = false;
  for (let tries = 0; tries < 30 && rFil > 1e-6; tries++) {
    const d = (s / 2) * Math.cos(paRad); // flank line: n·P = d
    const cy = -hf + rFil;
    const cx = (d + rFil - cy * nrm.y) / nrm.x;
    const rootT = { x: cx, y: -hf };
    const flankT = add({ x: cx, y: cy }, scale(nrm, -rFil));
    if (rootT.x <= p / 2 && flankT.y < yTip) {
      if (p / 2 - rootT.x > 1e-12) rightHalf.push({ kind: 'line', a: { x: p / 2, y: -hf }, b: rootT });
      rightHalf.push({ kind: 'arc', center: { x: cx, y: cy }, r: rFil, start: -Math.PI / 2, end: paRad - Math.PI });
      rightHalf.push({ kind: 'line', a: flankT, b: { x: half(yTip), y: yTip } });
      built = true;
      break;
    }
    rFil *= 0.8;
  }
  if (!built) {
    const foot = { x: half(-hf), y: -hf };
    rightHalf.push({ kind: 'line', a: { x: p / 2, y: -hf }, b: foot });
    rightHalf.push({ kind: 'line', a: foot, b: { x: half(yTip), y: yTip } });
  }
  if (half(yTip) > 1e-12) rightHalf.push({ kind: 'line', a: { x: half(yTip), y: yTip }, b: { x: 0, y: yTip } });
  const tooth0 = [...rightHalf, ...rightHalf.map((x) => mirrorSeg(x, 0)).map(reverseSeg).reverse()];

  const shift = (seg: Segment, dx: number): Segment => {
    const sh = (q: Vec2) => ({ x: q.x + dx, y: q.y });
    if (seg.kind === 'line') return { kind: 'line', a: sh(seg.a), b: sh(seg.b) };
    if (seg.kind === 'arc') return { ...seg, center: sh(seg.center) };
    return { kind: 'bezier', p: [sh(seg.p[0]), sh(seg.p[1]), sh(seg.p[2]), sh(seg.p[3])] };
  };

  const loop: Loop = [
    { kind: 'line', a: { x: -L / 2, y: yb }, b: { x: L / 2, y: yb } },
    { kind: 'line', a: { x: L / 2, y: yb }, b: { x: L / 2, y: -hf } },
  ];
  for (let k = n - 1; k >= 0; k--) {
    const xk = (k - (n - 1) / 2) * p;
    loop.push(...tooth0.map((seg) => shift(seg, xk)));
  }
  loop.push({ kind: 'line', a: { x: -L / 2, y: -hf }, b: { x: -L / 2, y: yb } });
  return loop;
}

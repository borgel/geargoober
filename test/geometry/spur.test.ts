import { describe, expect, it } from 'vitest';
import { flankAngleAt, radii, toothTipHalfAngle, type ToothParams } from '../../src/core/gearmath';
import { spurOuterLoop } from '../../src/core/geometry/spur';
import { loopArea, sampleSegment, segPoint, segStart, segTangent } from '../../src/core/geometry/sample';
import type { Loop } from '../../src/core/geometry/types';
import { expectClosed } from '../helpers/geom';
import { dist, dot, len, rot, type Vec2 } from '../../src/core/vec';

const DEG = Math.PI / 180;
const params = (z: number, extra: Partial<ToothParams> = {}): ToothParams => ({
  m: 1,
  z,
  paRad: 20 * DEG,
  backlash: 0.1,
  clearanceCoef: 0.25,
  ...extra,
});

/** Angles (relative to tooth 0) where the loop crosses radius r near tooth 0. */
function crossings(loop: Loop, r: number, z: number): number[] {
  const out: number[] = [];
  for (const s of loop) {
    const n = 400;
    let prev = segPoint(s, 0);
    for (let i = 1; i <= n; i++) {
      const cur = segPoint(s, i / n);
      const a = len(prev) - r;
      const b = len(cur) - r;
      if (a === 0 || a * b < 0) {
        const t = a / (a - b);
        const p = { x: prev.x + (cur.x - prev.x) * t, y: prev.y + (cur.y - prev.y) * t };
        const ang = Math.atan2(p.y, p.x);
        if (Math.abs(ang) < Math.PI / z) out.push(ang);
      }
      prev = cur;
    }
  }
  return out.sort((x, y) => x - y);
}

describe('spurOuterLoop', () => {
  for (const z of [12, 20, 48]) {
    it(`builds a closed, CCW profile for z=${z}`, () => {
      const p = params(z);
      const { loop, pointed } = spurOuterLoop(p);
      expect(pointed).toBe(false);
      expectClosed(loop);
      const r = radii(p);
      const area = loopArea(loop);
      expect(area).toBeGreaterThan(Math.PI * r.rootR ** 2);
      expect(area).toBeLessThan(Math.PI * r.outerR ** 2);
      for (const pt of loop.flatMap((s) => sampleSegment(s, 0.01))) {
        expect(len(pt)).toBeGreaterThan(r.rootR - 1e-9);
        expect(len(pt)).toBeLessThan(r.outerR + 1e-9);
      }
    });
  }

  it('has the backlash-thinned tooth thickness at the pitch circle', () => {
    for (const z of [12, 31]) {
      const p = params(z);
      const { pitchR } = radii(p);
      const xs = crossings(spurOuterLoop(p).loop, pitchR, z);
      expect(xs).toHaveLength(2);
      const thickness = (xs[1] - xs[0]) * pitchR;
      expect(thickness).toBeCloseTo(Math.PI / 2 - 0.05, 3);
    }
  });

  it('keeps involute flanks within 0.001 mm of the true involute', () => {
    for (const z of [12, 40, 200]) {
      const p = params(z);
      const { baseR } = radii(p);
      const { loop } = spurOuterLoop(p);
      for (const s of loop.filter((x) => x.kind === 'bezier')) {
        for (let i = 0; i <= 20; i++) {
          const pt = segPoint(s, i / 20);
          const rho = len(pt);
          if (rho < baseR) continue;
          const pitchAng = (2 * Math.PI) / z;
          const ang = Math.atan2(pt.y, pt.x);
          const local = ang - Math.round(ang / pitchAng) * pitchAng;
          const err = rho * Math.abs(Math.abs(local) - flankAngleAt(p, rho));
          expect(err).toBeLessThan(0.001);
        }
      }
    }
  });

  it('joins fillets tangentially to flank and root', () => {
    const { loop, filletR } = spurOuterLoop(params(20));
    expect(filletR).toBeCloseTo(0.38, 9);
    const arcsOfFillet = loop.filter((s) => s.kind === 'arc' && Math.abs(s.r - filletR) < 1e-9);
    expect(arcsOfFillet.length).toBe(40);
    for (let i = 0; i < loop.length; i++) {
      const s = loop[i];
      if (!(s.kind === 'arc' && Math.abs(s.r - filletR) < 1e-9)) continue;
      const before = loop[(i - 1 + loop.length) % loop.length];
      const after = loop[(i + 1) % loop.length];
      expect(dot(segTangent(before, 1), segTangent(s, 0))).toBeGreaterThan(1 - 1e-6);
      expect(dot(segTangent(s, 1), segTangent(after, 0))).toBeGreaterThan(1 - 1e-6);
    }
  });

  it('low tooth counts still produce closed profiles', () => {
    for (const z of [5, 6, 7, 8]) {
      const p = params(z);
      const { loop, pointed } = spurOuterLoop(p);
      expectClosed(loop);
      expect(loopArea(loop)).toBeGreaterThan(0);
      expect(pointed).toBe(toothTipHalfAngle(p) <= 0);
    }
  });

  it('handles pointed teeth by ending the flanks at the point', () => {
    const p = params(5, { backlash: 1.0 });
    expect(toothTipHalfAngle(p)).toBeLessThan(0);
    const { loop, pointed } = spurOuterLoop(p);
    expect(pointed).toBe(true);
    expectClosed(loop);
    expect(loopArea(loop)).toBeGreaterThan(0);
    for (const pt of loop.flatMap((s) => sampleSegment(s, 0.01))) expect(len(pt)).toBeLessThan(radii(p).outerR);
  });

  it('places tooth 0 on +x and repeats teeth by rotation', () => {
    const z = 10;
    const { loop } = spurOuterLoop(params(z));
    const per = loop.length / z;
    expect(Number.isInteger(per)).toBe(true);
    const a: Vec2 = segStart(loop[0]);
    const b: Vec2 = rot(segStart(loop[per]), -(2 * Math.PI) / z);
    expect(dist(a, b)).toBeLessThan(1e-9);
    expect(Math.atan2(a.y, a.x)).toBeCloseTo(-Math.PI / z, 9);
  });

  it('builds a 200-tooth gear quickly', () => {
    const t0 = performance.now();
    const { loop } = spurOuterLoop(params(200));
    expectClosed(loop);
    expect(performance.now() - t0).toBeLessThan(1000);
  });

  it('works at 14.5° pressure angle and with DP-sized module', () => {
    const { loop } = spurOuterLoop(params(32, { paRad: 14.5 * DEG, m: 25.4 / 24 }));
    expectClosed(loop);
  });
});

import { describe, expect, it } from 'vitest';
import { bezierPoint, fitHermite } from '../../src/core/geometry/bezier';
import { involutePoint } from '../../src/core/geometry/involute';
import {
  loopArea,
  pointInPolygon,
  reverseLoop,
  sampleLoop,
  segEnd,
  segPoint,
  segStart,
  segTangent,
  transformLoop,
} from '../../src/core/geometry/sample';
import type { Loop, Segment } from '../../src/core/geometry/types';
import { len, polar, v } from '../../src/core/vec';

const square = (s: number): Loop => [
  { kind: 'line', a: v(0, 0), b: v(s, 0) },
  { kind: 'line', a: v(s, 0), b: v(s, s) },
  { kind: 'line', a: v(s, s), b: v(0, s) },
  { kind: 'line', a: v(0, s), b: v(0, 0) },
];
const circle = (r: number): Loop => [
  { kind: 'arc', center: v(0, 0), r, start: 0, end: Math.PI },
  { kind: 'arc', center: v(0, 0), r, start: Math.PI, end: 2 * Math.PI },
];

describe('fitHermite', () => {
  it('fits a quarter circle within 0.001 mm', () => {
    const r = 50;
    const segs = fitHermite((u) => polar(r, u), 0, Math.PI / 2, 0.001);
    expect(segs.length).toBeGreaterThan(0);
    expect(segs.length).toBeLessThan(10);
    for (const s of segs) {
      for (let i = 0; i <= 50; i++) {
        expect(Math.abs(len(bezierPoint(s.p, i / 50)) - r)).toBeLessThan(0.001);
      }
    }
    expect(segs[0].p[0].x).toBeCloseTo(r, 12);
    expect(segs[segs.length - 1].p[3].y).toBeCloseTo(r, 12);
  });

  it('chains spans end to end', () => {
    const segs = fitHermite((u) => polar(100, u), 0, Math.PI, 1e-5);
    for (let i = 1; i < segs.length; i++) expect(segs[i].p[0]).toEqual(segs[i - 1].p[3]);
  });
});

describe('involutePoint', () => {
  it('matches the analytic radius and polar angle', () => {
    const rb = 9.4;
    for (const t of [0, 0.2, 0.5, 0.9]) {
      const p = involutePoint(rb, t);
      expect(len(p)).toBeCloseTo(rb * Math.sqrt(1 + t * t), 12);
      expect(Math.atan2(p.y, p.x)).toBeCloseTo(t - Math.atan(t), 12);
    }
  });
});

describe('segments', () => {
  it('evaluates arcs in traversal direction', () => {
    const cw: Segment = { kind: 'arc', center: v(1, 1), r: 2, start: Math.PI / 2, end: 0 };
    expect(segStart(cw).x).toBeCloseTo(1, 12);
    expect(segStart(cw).y).toBeCloseTo(3, 12);
    expect(segEnd(cw).x).toBeCloseTo(3, 12);
    const mid = segPoint(cw, 0.5);
    expect(mid.x).toBeCloseTo(1 + Math.SQRT2, 12);
    const t = segTangent(cw, 0);
    expect(t.x).toBeCloseTo(1, 12);
    expect(t.y).toBeCloseTo(0, 12);
  });

  it('computes signed loop area', () => {
    expect(loopArea(square(1))).toBeCloseTo(1, 9);
    expect(loopArea(reverseLoop(square(1)))).toBeCloseTo(-1, 9);
    expect(loopArea(circle(10))).toBeCloseTo(Math.PI * 100, 9);
  });

  it('samples loops within tolerance', () => {
    const pts = sampleLoop(circle(10), 0.001);
    for (const p of pts) expect(len(p)).toBeCloseTo(10, 9);
    expect(pts.length).toBeGreaterThan(100);
  });

  it('transforms loops by rotation and translation', () => {
    const moved = transformLoop(circle(1), Math.PI / 2, 5, 0);
    expect(segStart(moved[0]).x).toBeCloseTo(5, 12);
    expect(segStart(moved[0]).y).toBeCloseTo(1, 12);
    const sq = transformLoop(square(1), Math.PI / 2, 0, 0);
    expect(segEnd(sq[0]).y).toBeCloseTo(1, 12);
  });

  it('tests points in polygons', () => {
    const poly = sampleLoop(square(2));
    expect(pointInPolygon(v(1, 1), poly)).toBe(true);
    expect(pointInPolygon(v(3, 1), poly)).toBe(false);
  });
});

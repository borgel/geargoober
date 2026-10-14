import { describe, expect, it } from 'vitest';
import { rackOuterLoop } from '../../src/core/geometry/rack';
import { loopArea, sampleSegment, segPoint } from '../../src/core/geometry/sample';
import { expectClosed } from '../helpers/geom';

const DEG = Math.PI / 180;
const base = { m: 1, n: 10, paRad: 20 * DEG, backlash: 0.1, clearanceCoef: 0.25, backHeight: 5 };

describe('rackOuterLoop', () => {
  it('is closed and counter-clockwise', () => {
    const loop = rackOuterLoop(base);
    expectClosed(loop);
    const L = 10 * Math.PI;
    const area = loopArea(loop);
    // between the solid below the root line and the full block up to the tips
    expect(area).toBeGreaterThan(L * 5);
    expect(area).toBeLessThan(L * (5 + 2.25));
  });

  it('spans its length and heights', () => {
    const pts = rackOuterLoop(base).flatMap((s) => sampleSegment(s, 0.01));
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    expect(Math.min(...xs)).toBeCloseTo(-5 * Math.PI, 9);
    expect(Math.max(...xs)).toBeCloseTo(5 * Math.PI, 9);
    expect(Math.max(...ys)).toBeCloseTo(1, 9);
    expect(Math.min(...ys)).toBeCloseTo(-1.25 - 5, 9);
  });

  it('has backlash-thinned tooth thickness on the pitch line', () => {
    const loop = rackOuterLoop({ ...base, n: 3 });
    const xs: number[] = [];
    for (const s of loop) {
      let prev = segPoint(s, 0);
      for (let i = 1; i <= 200; i++) {
        const cur = segPoint(s, i / 200);
        if ((prev.y < 0) !== (cur.y < 0)) xs.push(prev.x + ((cur.x - prev.x) * -prev.y) / (cur.y - prev.y));
        prev = cur;
      }
    }
    xs.sort((a, b) => a - b);
    // middle tooth (k = 1) is centered on x = 0
    const mid = xs.filter((x) => Math.abs(x) < Math.PI / 2);
    expect(mid).toHaveLength(2);
    expect(mid[1] - mid[0]).toBeCloseTo(Math.PI / 2 - 0.05, 6);
  });

  it('builds a single-tooth rack', () => {
    expectClosed(rackOuterLoop({ ...base, n: 1 }));
  });
});

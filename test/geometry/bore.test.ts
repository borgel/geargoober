import { describe, expect, it } from 'vitest';
import { boreLoop } from '../../src/core/geometry/bore';
import { loopArea, sampleSegment } from '../../src/core/geometry/sample';
import { len } from '../../src/core/vec';
import { expectClosed } from '../helpers/geom';

describe('boreLoop', () => {
  it('makes a clockwise round hole', () => {
    const loop = boreLoop({ kind: 'round', dia: 5 }, { relief: 0.2 });
    expectClosed(loop);
    expect(loopArea(loop)).toBeCloseTo(-Math.PI * 6.25, 9);
  });

  it('shrinks a round hole by the kerf allowance', () => {
    const loop = boreLoop({ kind: 'round', dia: 5 }, { relief: 0.2, shrink: 0.1 });
    expect(loopArea(loop)).toBeCloseTo(-Math.PI * 2.4 ** 2, 9);
  });

  it('makes a D-flat hole with the flat on +y', () => {
    const loop = boreLoop({ kind: 'dflat', dia: 5, flatDepth: 0.5 }, { relief: 0.2 });
    expectClosed(loop);
    const area = -loopArea(loop);
    const R = 2.5;
    const h = 2;
    const segment = R * R * Math.acos(h / R) - h * Math.sqrt(R * R - h * h);
    expect(area).toBeCloseTo(Math.PI * R * R - segment, 9);
    const ys = loop.flatMap((s) => sampleSegment(s, 0.001)).map((p) => p.y);
    expect(Math.max(...ys)).toBeCloseTo(2, 9);
  });

  it('makes a hex hole with relieved corners', () => {
    const af = 6.35;
    const sharp = (Math.sqrt(3) / 2) * af * af;
    const loop = boreLoop({ kind: 'hex', acrossFlats: af }, { relief: 0.2 });
    expectClosed(loop);
    const area = -loopArea(loop);
    expect(area).toBeLessThan(sharp);
    expect(area).toBeGreaterThan(sharp - 0.2);
    // flats are horizontal: max y equals the apothem
    const ys = loop.flatMap((s) => sampleSegment(s, 0.001)).map((p) => p.y);
    expect(Math.max(...ys)).toBeCloseTo(af / 2, 9);
  });

  it('shrinks hex across-flats by twice the allowance and keeps sharp corners at zero relief', () => {
    const loop = boreLoop({ kind: 'hex', acrossFlats: 6 }, { relief: 0, shrink: 0.1 });
    expect(-loopArea(loop)).toBeCloseTo((Math.sqrt(3) / 2) * 5.8 * 5.8, 9);
    expect(loop.every((s) => s.kind === 'line')).toBe(true);
  });

  it('makes a square hole', () => {
    const loop = boreLoop({ kind: 'square', side: 5 }, { relief: 0.2 });
    expectClosed(loop);
    const area = -loopArea(loop);
    expect(area).toBeCloseTo(25 - (4 - Math.PI) * 0.04, 9);
    const r = Math.max(...loop.flatMap((s) => sampleSegment(s, 0.001)).map(len));
    expect(r).toBeLessThan(2.5 * Math.SQRT2);
  });
});

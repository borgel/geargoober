import { describe, expect, it } from 'vitest';
import { moduleOf } from '../../src/core/units';
import { boreRadius, newProject } from '../../src/core/model';

describe('moduleOf', () => {
  it('returns module directly', () => {
    const p = newProject();
    p.pitch = { system: 'module', value: 1.5 };
    expect(moduleOf(p)).toBe(1.5);
  });
  it('converts diametral pitch to module', () => {
    const p = newProject();
    p.pitch = { system: 'dp', value: 24 };
    expect(moduleOf(p)).toBeCloseTo(25.4 / 24, 12);
  });
  it('returns NaN for a zero DP', () => {
    const p = newProject();
    p.pitch = { system: 'dp', value: 0 };
    expect(moduleOf(p)).toBeNaN();
  });
});

describe('boreRadius', () => {
  it('gives max extent for each bore kind', () => {
    expect(boreRadius({ kind: 'round', dia: 5 })).toBe(2.5);
    expect(boreRadius({ kind: 'dflat', dia: 5, flatDepth: 0.5 })).toBe(2.5);
    expect(boreRadius({ kind: 'hex', acrossFlats: Math.sqrt(3) })).toBeCloseTo(1, 12);
    expect(boreRadius({ kind: 'square', side: 2 })).toBeCloseTo(Math.SQRT2, 12);
  });
});

describe('newProject', () => {
  it('uses spec defaults', () => {
    const p = newProject();
    expect(p.pressureAngleDeg).toBe(20);
    expect(p.fit).toEqual({ backlashMm: 0.1, clearanceCoef: 0.25, kerfMm: 0, cornerReliefMm: 0.2 });
    expect(p.exportPrefs).toEqual({ kerfDxf: true, kerfStep: false });
  });
});

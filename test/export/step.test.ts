import { describe, expect, it } from 'vitest';
import { partStep } from '../../src/core/export/step';
import { partProfile } from '../../src/core/geometry/parts';
import { profileArea } from '../../src/core/geometry/sample';
import { solve } from '../../src/core/solver';
import { measureStep } from '../helpers/occt';
import { project } from '../helpers/project';

const P = project(`
input S1 rpm 100
fit kerf 0.2
shaft S1 bore round 5
shaft S2 bore hex 6.35
shaft S3 bore dflat 5 0.5
shaft S4 bore square 4
gear G12 on S1 teeth 12 width 6
gear G48 on S2 teeth 48 width 8
gear G20 on S3 teeth 20 width 5
gear G9 on S4 teeth 9 width 3
rack R10 teeth 10 width 7 back 4
mesh G12 G48 angle 0
mesh G48 G20 angle 90
mesh G20 G9 angle 180
mesh G9 R10 angle 270
`);
const S = solve(P);

async function check(id: string, height: number, kerf: boolean) {
  const step = partStep(P, S, id, { kerf });
  const prof = partProfile(P, S, id, { kerf });
  if (!prof.ok) throw new Error(prof.error);
  const expected = profileArea(prof.profile) * height;
  const m = await measureStep(step);
  expect(m.success).toBe(true);
  expect(m.meshes).toBe(1);
  expect(Math.abs(m.volume - expected) / expected).toBeLessThan(0.001);
  expect(m.min[2]).toBeCloseTo(0, 6);
  expect(m.max[2]).toBeCloseTo(height, 6);
}

describe('partStep', { timeout: 60_000 }, () => {
  it('writes an AP214 file with one manifold solid', () => {
    const step = partStep(P, S, 'G12', { kerf: false });
    expect(step.startsWith('ISO-10303-21;')).toBe(true);
    expect(step).toContain("FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'))");
    expect(step.match(/MANIFOLD_SOLID_BREP/g)).toHaveLength(1);
    expect(step).toContain('SI_UNIT(.MILLI.,.METRE.)');
    expect(step.trim().endsWith('END-ISO-10303-21;')).toBe(true);
  });

  it('round-trips a 12-tooth gear with round bore as a solid of the right volume', () => check('G12', 6, false));
  it('round-trips a 48-tooth gear with hex bore', () => check('G48', 8, false));
  it('round-trips a 20-tooth gear with D-flat bore', () => check('G20', 5, false));
  it('round-trips a 9-tooth gear with square bore', () => check('G9', 3, false));
  it('round-trips a rack', () => check('R10', 7, false));
  it('round-trips a kerf-offset gear', () => check('G20', 5, true));
});

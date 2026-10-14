import { describe, expect, it } from 'vitest';
import { solve } from '../../src/core/solver';
import { frac, project, solveText } from '../helpers/project';

const shaft = (s: ReturnType<typeof solveText>, id: string) => s.shafts.find((x) => x.id === id)!;
const gear = (s: ReturnType<typeof solveText>, id: string) => s.gears.find((x) => x.id === id)!;
const errors = (s: ReturnType<typeof solveText>) => s.issues.filter((i) => i.severity === 'error');
const warnings = (s: ReturnType<typeof solveText>) => s.issues.filter((i) => i.severity === 'warning');

const PAIR = `
input S1 rpm 1000
shaft S1 bore round 5
shaft S2 bore round 5
gear G1 on S1 teeth 20 width 6
gear G2 on S2 teeth 40 width 6
mesh G1 G2 angle 0
`;

describe('solve: speeds', () => {
  it('solves a simple pair', () => {
    const s = solveText(PAIR);
    expect(errors(s)).toEqual([]);
    expect(s.ok).toBe(true);
    expect(shaft(s, 'S1').rpm).toBe(1000);
    expect(shaft(s, 'S1').dir).toBe('ccw');
    expect(shaft(s, 'S2').rpm).toBeCloseTo(-500, 9);
    expect(shaft(s, 'S2').dir).toBe('cw');
    expect(shaft(s, 'S2').torqueRatio).toBeCloseTo(2, 9);
    expect(s.meshes[0].centerDist).toBeCloseTo(30, 9);
    expect(s.meshes[0].ratio).toBeCloseTo(2, 9);
    expect(gear(s, 'G1').surfaceSpeed).toBeCloseTo((1000 * 2 * Math.PI) / 60 * 10, 6);
  });

  it('solves a compound reduction', () => {
    const s = solveText(`
input S1 rpm 1000
shaft S1 bore round 5
shaft S2 bore round 5
shaft S3 bore round 5
gear G1 on S1 teeth 12 width 6
gear G2 on S2 teeth 48 width 6
gear G3 on S2 teeth 12 width 6 z 6
gear G4 on S3 teeth 48 width 6 z 6
mesh G1 G2 angle 0
mesh G3 G4 angle 90
`);
    expect(errors(s)).toEqual([]);
    expect(shaft(s, 'S3').rpm).toBeCloseTo(62.5, 9);
  });

  it('keeps direction through an idler', () => {
    const s = solveText(`
input S1 rpm 1000
shaft S1 bore round 5
shaft S2 bore round 5
shaft S3 bore round 5
gear G1 on S1 teeth 20 width 6
gear G2 on S2 teeth 30 width 6
gear G3 on S3 teeth 20 width 6
mesh G1 G2 angle 0
mesh G2 G3 angle 0
`);
    expect(shaft(s, 'S3').rpm).toBeCloseTo(1000, 9);
  });

  it('drives a pinion from a rack input', () => {
    const s = solveText(`
input R1 mmps 50
shaft S1 bore round 5
gear G1 on S1 teeth 20 width 6
rack R1 teeth 20 width 6
mesh G1 R1 angle 270
`);
    expect(errors(s)).toEqual([]);
    // rack moving +x below the gear turns it CCW
    expect(shaft(s, 'S1').rpm).toBeCloseTo((50 / 10) * (60 / (2 * Math.PI)), 9);
    expect(s.racks[0].mmPerSec).toBe(50);
  });

  it('drives a rack from a pinion', () => {
    const s = solveText(`
input S1 rpm 60
shaft S1 bore round 5
gear G1 on S1 teeth 20 width 6
rack R1 teeth 20 width 6
mesh G1 R1 angle 270
`);
    expect(s.racks[0].mmPerSec).toBeCloseTo(2 * Math.PI * 10, 9);
  });

  it('uses diametral pitch for center distance', () => {
    const s = solveText(PAIR.replace('input', 'pitch dp 24\ninput'));
    expect(s.module).toBeCloseTo(25.4 / 24, 12);
    expect(s.meshes[0].centerDist).toBeCloseTo((25.4 / 24) * 30, 9);
  });

  it('flags a speed conflict in an odd loop', () => {
    const s = solveText(`
input S1 rpm 100
shaft S1 bore round 5
shaft S2 bore round 5
shaft S3 bore round 5
gear G1 on S1 teeth 20 width 6
gear G2 on S2 teeth 20 width 6
gear G3 on S3 teeth 20 width 6
mesh G1 G2 angle 0
mesh G1 G3 angle 60
mesh G2 G3 angle 120
`);
    expect(s.ok).toBe(false);
    expect(errors(s).some((e) => /speed/i.test(e.message))).toBe(true);
  });

  it('reports parts not driven by the input', () => {
    const s = solveText(PAIR + 'shaft S9 bore round 5\ngear G9 on S9 teeth 20 width 6\n');
    expect(shaft(s, 'S9').rpm).toBeUndefined();
    expect(warnings(s).some((w) => w.refs.includes('S9') && /not driven/i.test(w.message))).toBe(true);
  });

  it('errors when there is no input', () => {
    const s = solveText(PAIR.replace('input S1 rpm 1000', ''));
    expect(errors(s).some((e) => /input/i.test(e.message))).toBe(true);
  });

  it('errors when the input target is missing', () => {
    const s = solveText(PAIR.replace('input S1', 'input S7'));
    expect(errors(s).some((e) => e.refs.includes('S7'))).toBe(true);
  });
});

const SQUARE = (lastAngle: number) => `
input S1 rpm 100
shaft S1 bore round 5
shaft S2 bore round 5
shaft S3 bore round 5
shaft S4 bore round 5
gear G1 on S1 teeth 20 width 6
gear G2 on S2 teeth 20 width 6
gear G3 on S3 teeth 20 width 6
gear G4 on S4 teeth 20 width 6
mesh G1 G2 angle 0
mesh G2 G3 angle 90
mesh G3 G4 angle 180
mesh G4 G1 angle ${lastAngle}
`;

describe('solve: layout', () => {
  it('places shafts along the mesh angle', () => {
    const s = solveText(PAIR);
    expect(shaft(s, 'S1')).toMatchObject({ x: 0, y: 0 });
    expect(shaft(s, 'S2').x).toBeCloseTo(30, 9);
    expect(shaft(s, 'S2').y).toBeCloseTo(0, 9);
    const s90 = solveText(PAIR.replace('angle 0', 'angle 90'));
    expect(shaft(s90, 'S2').x).toBeCloseTo(0, 9);
    expect(shaft(s90, 'S2').y).toBeCloseTo(30, 9);
  });

  it('accepts a consistent even loop', () => {
    const s = solveText(SQUARE(270));
    expect(errors(s)).toEqual([]);
    expect(shaft(s, 'S4').x).toBeCloseTo(0, 9);
    expect(shaft(s, 'S4').y).toBeCloseTo(20, 9);
  });

  it('flags a position conflict in a loop', () => {
    const s = solveText(SQUARE(260));
    expect(s.ok).toBe(false);
    expect(errors(s).some((e) => /position/i.test(e.message))).toBe(true);
  });

  it('lays out disconnected components side by side', () => {
    const s = solveText(PAIR + 'shaft S9 bore round 5\ngear G9 on S9 teeth 20 width 6\n');
    // first component extends to x = 30 + 21 (G2 outer radius)
    expect(shaft(s, 'S9').x).toBeGreaterThan(51 + 11);
    expect(warnings(s).some((w) => w.refs.includes('S9') && /not connected/i.test(w.message))).toBe(true);
  });

  it('places a second pinion from a rack using the mesh offset', () => {
    const s = solveText(`
input S1 rpm 100
shaft S1 bore round 3
shaft S2 bore round 3
gear G1 on S1 teeth 20 width 6
gear G2 on S2 teeth 10 width 6
rack R1 teeth 30 width 6
mesh G1 R1 angle 270
mesh G2 R1 angle 270 offset 40
`);
    expect(errors(s)).toEqual([]);
    const contactX = s.meshes[0].contactX!;
    expect(shaft(s, 'S2').y).toBeCloseTo(-5, 9);
    expect(shaft(s, 'S2').x).toBeCloseTo(40 - contactX, 9);
    expect(shaft(s, 'S2').rpm).toBeCloseTo(200, 9);
  });
});

describe('solve: phases', () => {
  it('meshes gear teeth into gaps (fA + fB = 0.5)', () => {
    const s = solveText(PAIR.replace('teeth 20', 'teeth 13').replace('teeth 40', 'teeth 29').replace('angle 0', 'angle 37'));
    const beta = (37 * Math.PI) / 180;
    const g1 = gear(s, 'G1');
    const g2 = gear(s, 'G2');
    const fA = frac((beta - g1.phase) / ((2 * Math.PI) / 13));
    const fB = frac((beta + Math.PI - g2.phase) / ((2 * Math.PI) / 29));
    expect(frac(fA + fB + 1e-12)).toBeCloseTo(0.5, 9);
  });

  it('puts a rack gap opposite a pinion tooth', () => {
    const s = solveText(`
input S1 rpm 100
shaft S1 bore round 3
gear G1 on S1 teeth 17 width 6
rack R1 teeth 12 width 6
mesh G1 R1 angle 250
`);
    const g = gear(s, 'G1');
    const r = s.racks[0];
    const beta = (250 * Math.PI) / 180;
    const fG = frac((beta - g.phase) / ((2 * Math.PI) / 17));
    const x0 = (-(12 - 1) / 2) * r.pitch;
    const fR = frac((s.meshes[0].contactX! - x0) / r.pitch);
    expect(frac(fR - fG - 0.5 + 1e-12)).toBeCloseTo(0, 9);
    expect(Math.abs(s.meshes[0].contactX!)).toBeLessThanOrEqual(r.pitch);
  });
});

describe('solve: validation', () => {
  it('rejects degenerate numeric values', () => {
    const p = project(PAIR + 'shaft S3 bore round 0\ngear G3 on S3 teeth 3 width 6\ngear G4 on S3 teeth 12.5 width 6\ngear G5 on S3 teeth 20 width 0\n');
    p.gears.push({ id: 'G6', name: 'G6', shaftId: 'S3', teeth: NaN, faceWidth: 5, zOffset: 0 });
    let s!: ReturnType<typeof solve>;
    expect(() => (s = solve(p))).not.toThrow();
    expect(s.ok).toBe(false);
    for (const id of ['S3', 'G3', 'G4', 'G5', 'G6']) {
      expect(errors(s).some((e) => e.refs.includes(id))).toBe(true);
    }
  });

  it('rejects a zero module', () => {
    const s = solveText('pitch module 0\n' + PAIR);
    expect(s.ok).toBe(false);
    expect(errors(s).some((e) => /module|pitch/i.test(e.message))).toBe(true);
  });

  it('rejects meshing gears on the same shaft', () => {
    const s = solveText(PAIR.replace('on S2 teeth 40', 'on S1 teeth 40'));
    expect(errors(s).some((e) => /same shaft/i.test(e.message))).toBe(true);
  });

  it('rejects unknown references and rack as first mesh member', () => {
    const s = solveText(PAIR + 'rack R1 teeth 10 width 5\nmesh R1 G1 angle 0\nmesh G1 G77 angle 0\ngear G8 on S77 teeth 20 width 5\n');
    expect(errors(s).some((e) => e.refs.includes('R1'))).toBe(true);
    expect(errors(s).some((e) => e.refs.includes('G77'))).toBe(true);
    expect(errors(s).some((e) => e.refs.includes('S77'))).toBe(true);
  });
});

describe('solve: warnings', () => {
  const has = (s: ReturnType<typeof solveText>, re: RegExp, id: string) =>
    warnings(s).some((w) => re.test(w.message) && w.refs.includes(id));

  it('warns about undercut at the standard limits', () => {
    expect(has(solveText(PAIR.replace('teeth 20', 'teeth 16')), /undercut/i, 'G1')).toBe(true);
    expect(has(solveText(PAIR.replace('teeth 20', 'teeth 17')), /undercut/i, 'G1')).toBe(false);
    const pa = 'pressure_angle 14.5\n';
    expect(has(solveText(pa + PAIR.replace('teeth 20', 'teeth 31')), /undercut/i, 'G1')).toBe(true);
    expect(has(solveText(pa + PAIR.replace('teeth 20', 'teeth 32')), /undercut/i, 'G1')).toBe(false);
  });

  it('computes contact ratio', () => {
    expect(solveText(PAIR).meshes[0].contactRatio).toBeCloseTo(1.635, 2);
  });

  it('warns about pointed teeth on very small gears', () => {
    // standard 20° teeth stay blunt down to very low counts; heavy backlash thins them to a point
    const s = solveText('fit backlash 1.0\n' + PAIR.replace('teeth 20', 'teeth 5'));
    expect(has(s, /pointed/i, 'G1')).toBe(true);
    expect(has(solveText(PAIR.replace('teeth 20', 'teeth 5')), /pointed/i, 'G1')).toBe(false);
    expect(has(solveText(PAIR), /pointed/i, 'G1')).toBe(false);
  });

  it('warns when the bore leaves too little rim', () => {
    const s = solveText(PAIR.replace('shaft S1 bore round 5', 'shaft S1 bore round 8').replace('teeth 20', 'teeth 12'));
    expect(has(s, /bore/i, 'G1')).toBe(true);
  });

  it('warns about meshing gears whose faces do not overlap in z', () => {
    expect(has(solveText(PAIR.replace('teeth 40 width 6', 'teeth 40 width 6 z 10')), /z/i, 'G2')).toBe(true);
  });

  it('warns about overlapping non-meshing gears', () => {
    // G3 sits 20 mm from G1 (outer radii 11 + 11) without a declared mesh
    const s = solveText(`
input S1 rpm 100
shaft S1 bore round 5
shaft S2 bore round 5
shaft S3 bore round 5
gear G1 on S1 teeth 20 width 6
gear G2 on S2 teeth 20 width 6
gear G3 on S3 teeth 20 width 6
mesh G1 G2 angle 0
mesh G2 G3 angle 120
`);
    expect(has(s, /overlap/i, 'G3')).toBe(true);
    expect(has(solveText(SQUARE(270)), /overlap/i, 'G3')).toBe(false);
  });

  it('warns when a gear covers another shaft', () => {
    const s = solveText(`
input S1 rpm 100
shaft S1 bore round 5
shaft S2 bore round 5
shaft S3 bore round 5
gear G1 on S1 teeth 40 width 6
gear G2 on S2 teeth 20 width 6
gear G3 on S2 teeth 20 width 6 z 10
gear G4 on S3 teeth 20 width 6 z 10
mesh G1 G2 angle 0
mesh G3 G4 angle 180
`);
    expect(warnings(s).some((w) => /shaft/i.test(w.message) && w.refs.includes('G1') && w.refs.includes('S3'))).toBe(true);
  });

  it('warns when the rack is too short for the contact point', () => {
    const s = solveText(`
input S1 rpm 100
shaft S1 bore round 3
shaft S2 bore round 3
gear G1 on S1 teeth 20 width 6
gear G2 on S2 teeth 10 width 6
rack R1 teeth 10 width 6
mesh G1 R1 angle 270
mesh G2 R1 angle 270 offset 100
`);
    expect(has(s, /rack/i, 'R1')).toBe(true);
  });

  it('warns about low contact ratio', () => {
    const s = solveText(PAIR.replace('teeth 20', 'teeth 5').replace('teeth 40', 'teeth 5'));
    expect(s.meshes[0].contactRatio).toBeLessThan(1.2);
    expect(has(s, /contact ratio/i, 'G1')).toBe(true);
  });
});

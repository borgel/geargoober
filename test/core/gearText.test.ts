import { describe, expect, it } from 'vitest';
import { parseGear, serializeGear } from '../../src/core/format/gearText';
import type { Project } from '../../src/core/model';

const SPEC_EXAMPLE = `project "Clock reduction"
pitch module 1.0            # or: pitch dp 24
pressure_angle 20
fit backlash 0.1 clearance 0.25 kerf 0.15 relief 0.2
input S1 rpm 1000

shaft S1 bore round 5
shaft S2 bore dflat 5 0.5
shaft S3 bore hex 6.35
shaft S4 bore square 5
gear  G1 on S1 teeth 12 width 6
gear  G2 on S2 teeth 48 width 6
gear  G3 on S2 teeth 12 width 6 z 6
rack  R1 teeth 30 width 6 back 5
mesh  G1 G2 angle 0
mesh  G3 R1 angle 270
`;

function ok(text: string): Project {
  const r = parseGear(text);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.project;
}

describe('parseGear', () => {
  it('parses the spec example', () => {
    const p = ok(SPEC_EXAMPLE);
    expect(p.name).toBe('Clock reduction');
    expect(p.pitch).toEqual({ system: 'module', value: 1 });
    expect(p.fit).toEqual({ backlashMm: 0.1, clearanceCoef: 0.25, kerfMm: 0.15, cornerReliefMm: 0.2 });
    expect(p.input).toEqual({ kind: 'shaft', shaftId: 'S1', rpm: 1000 });
    expect(p.shafts.map((s) => s.bore)).toEqual([
      { kind: 'round', dia: 5 },
      { kind: 'dflat', dia: 5, flatDepth: 0.5 },
      { kind: 'hex', acrossFlats: 6.35 },
      { kind: 'square', side: 5 },
    ]);
    expect(p.gears[2]).toEqual({ id: 'G3', name: 'G3', shaftId: 'S2', teeth: 12, faceWidth: 6, zOffset: 6 });
    expect(p.racks[0]).toEqual({ id: 'R1', name: 'R1', teeth: 30, faceWidth: 6, backHeight: 5 });
    expect(p.meshes[1]).toEqual({ a: 'G3', b: 'R1', angleDeg: 270 });
  });

  it('round-trips through serialize', () => {
    const p = ok(SPEC_EXAMPLE);
    expect(ok(serializeGear(p))).toEqual(p);
  });

  it('applies defaults for omitted optional tokens', () => {
    const p = ok('shaft S1 bore round 5\ngear G1 on S1 teeth 20 width 4\nrack R1 teeth 10 width 4\n');
    expect(p.gears[0].zOffset).toBe(0);
    expect(p.racks[0].backHeight).toBe(5);
    expect(p.pressureAngleDeg).toBe(20);
    expect(p.fit.backlashMm).toBe(0.1);
  });

  it('preserves diametral pitch as entered', () => {
    const p = ok('pitch dp 24\n');
    expect(p.pitch).toEqual({ system: 'dp', value: 24 });
    expect(serializeGear(p)).toContain('pitch dp 24');
  });

  it('parses a rack input', () => {
    expect(ok('input R1 mmps 50\n').input).toEqual({ kind: 'rack', rackId: 'R1', mmPerSec: 50 });
  });

  it('parses mesh offset and export prefs', () => {
    const p = ok('mesh G1 R1 angle 90 offset 40\nexport kerf_dxf off kerf_step on\n');
    expect(p.meshes[0]).toEqual({ a: 'G1', b: 'R1', angleDeg: 90, offset: 40 });
    expect(p.exportPrefs).toEqual({ kerfDxf: false, kerfStep: true });
  });

  it('tolerates CRLF, tabs and comments', () => {
    const p = ok('# header\r\nshaft\tS1\tbore round 5   # trailing\r\n\r\n  gear G1 on S1 teeth 20 width 4\r\n');
    expect(p.shafts).toHaveLength(1);
    expect(p.gears[0].teeth).toBe(20);
  });

  it('parses quoted names with spaces and # inside quotes', () => {
    const p = ok('shaft S1 name "Motor shaft #1" bore round 5\nproject "A \\"quoted\\" name"\n');
    expect(p.shafts[0].name).toBe('Motor shaft #1');
    expect(p.name).toBe('A "quoted" name');
    expect(ok(serializeGear(p)).name).toBe('A "quoted" name');
  });

  it('reports unknown keywords with line and column', () => {
    const r = parseGear('shaft S1 bore round 5\n  sprocket X\n');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0]).toMatchObject({ line: 2, col: 3 });
    expect(r.errors[0].message).toMatch(/sprocket/);
  });

  it('reports non-numeric values', () => {
    const r = parseGear('gear G1 on S1 teeth twelve width 4\n');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0]).toMatchObject({ line: 1, col: 21 });
  });

  it('reports missing values', () => {
    const r = parseGear('gear G1 on S1 teeth\n');
    expect(r.ok).toBe(false);
  });

  it('reports duplicate ids across parts', () => {
    const r = parseGear('shaft A bore round 5\ngear A on A teeth 20 width 4\n');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0].line).toBe(2);
    expect(r.errors[0].message).toMatch(/duplicate/i);
  });

  it('collects errors from several lines', () => {
    const r = parseGear('bogus\nshaft S1 bore oval 3\ngear G1 on S1 teeth x width 4\n');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.map((e) => e.line)).toEqual([1, 2, 3]);
  });

  it('leaves an empty input when none is given', () => {
    expect(ok('').input).toEqual({ kind: 'shaft', shaftId: '', rpm: 0 });
  });

  it('never throws on garbage', () => {
    for (const s of ['"', 'gear "unterminated', '\u0000\u0001', 'mesh', 'fit backlash', 'export kerf_dxf maybe']) {
      expect(() => parseGear(s)).not.toThrow();
    }
  });
});

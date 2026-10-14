import { describe, expect, it } from 'vitest';
import { isValidId, renameId } from '../../src/core/edit';
import { specHtml } from '../../src/core/export/spec';
import { fromJson } from '../../src/core/format/json';
import { serializeGear } from '../../src/core/format/gearText';
import { partProfile } from '../../src/core/geometry/parts';
import type { Bore } from '../../src/core/model';
import { solve } from '../../src/core/solver';
import { project, solveText } from '../helpers/project';

const errs = (s: ReturnType<typeof solve>) => s.issues.filter((i) => i.severity === 'error');
const warns = (s: ReturnType<typeof solve>) => s.issues.filter((i) => i.severity === 'warning');

describe('review fixes: ids', () => {
  it('validates ids', () => {
    expect(isValidId('G1')).toBe(true);
    expect(isValidId('drive_gear-2.a')).toBe(true);
    expect(isValidId('my gear')).toBe(false);
    expect(isValidId('')).toBe(false);
    expect(isValidId('a"b')).toBe(false);
  });

  it('refuses renames to invalid or existing ids', () => {
    const p = project('shaft S1 bore round 5\nshaft S2 bore round 5\ngear G1 on S1 teeth 20 width 5\ngear G2 on S2 teeth 20 width 5\nmesh G1 G2 angle 0\n');
    expect(renameId(p, 'G2', 'my gear')).toEqual(p);
    expect(renameId(p, 'G2', 'G1')).toEqual(p);
    expect(renameId(p, 'G2', 'S1')).toEqual(p);
  });
});

describe('review fixes: layout of disconnected components', () => {
  it('keeps a whole disconnected component clear of the first', () => {
    const s = solveText(`
input S1 rpm 10
shaft S1 bore round 5
shaft S2 bore round 5
shaft S3 bore round 5
shaft S4 bore round 5
gear G1 on S1 teeth 40 width 5
gear G2 on S2 teeth 40 width 5
gear G3 on S3 teeth 20 width 5
gear G4 on S4 teeth 40 width 5
mesh G1 G2 angle 0
mesh G3 G4 angle 180
`);
    expect(warns(s).filter((w) => /overlap|passes over/.test(w.message))).toEqual([]);
    const x = (id: string) => s.shafts.find((q) => q.id === id)!.x;
    // first component spans to x = 40 + 21; second component's leftmost edge (S4 − 21) must be beyond it
    expect(x('S4') - 21).toBeGreaterThan(61);
  });
});

describe('review fixes: bores', () => {
  it('errors when the bore reaches the root circle', () => {
    const s = solveText('input S1 rpm 1\nshaft S1 bore round 30\ngear G on S1 teeth 20 width 5\n');
    expect(errs(s).some((e) => /bore/i.test(e.message) && e.refs.includes('G'))).toBe(true);
  });

  it('errors when corner relief does not fit the bore polygon', () => {
    const s = solveText('fit relief 3\ninput S1 rpm 1\nshaft S1 bore hex 4\ngear G on S1 teeth 40 width 5\n');
    expect(errs(s).some((e) => /relief|corner/i.test(e.message))).toBe(true);
  });

  it('reports kerf that would close up a bore', () => {
    const p = project('pitch module 3\nfit kerf 5\ninput S1 rpm 1\nshaft S1 bore round 4\ngear G on S1 teeth 40 width 5\n');
    const r = partProfile(p, solve(p), 'G', { kerf: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/bore/i);
  });
});

describe('review fixes: robustness', () => {
  it('rejects malformed JSON projects instead of throwing later', () => {
    const bad = '{"project":{"pitch":{"system":"module","value":1},"shafts":[{"id":"S1"}],"gears":[],"racks":[],"meshes":[]}}';
    expect(fromJson(bad).ok).toBe(false);
  });

  it('reports an unknown bore kind instead of throwing', () => {
    const p = project('input S1 rpm 1\nshaft S1 bore round 5\ngear G on S1 teeth 20 width 5\n');
    p.shafts[0].bore = { kind: 'oval' } as unknown as Bore;
    let s!: ReturnType<typeof solve>;
    expect(() => (s = solve(p))).not.toThrow();
    expect(errs(s).some((e) => e.refs.includes('S1'))).toBe(true);
  });

  it('rejects absurd tooth counts before building geometry', () => {
    const s = solveText('input S1 rpm 1\nshaft S1 bore round 5\ngear G on S1 teeth 100000 width 5\nrack R teeth 50000 width 5\n');
    expect(errs(s).some((e) => e.refs.includes('G'))).toBe(true);
    expect(errs(s).some((e) => e.refs.includes('R'))).toBe(true);
  });

  it('warns when a rack mesh offset is ignored', () => {
    const s = solveText(`
input S1 rpm 1
shaft S1 bore round 3
gear G1 on S1 teeth 20 width 5
rack R teeth 40 width 5
mesh G1 R angle 270 offset -30
`);
    expect(warns(s).some((w) => /offset/i.test(w.message) && w.refs.includes('G1'))).toBe(true);
  });
});

describe('review fixes: spec sheet outputs', () => {
  it('summarizes output speeds and overall ratios', () => {
    const p = project(`
input S1 rpm 1000
shaft S1 bore round 5
shaft S2 bore round 5
shaft S3 bore round 5
gear G1 on S1 teeth 20 width 6
gear G2 on S2 teeth 40 width 6
gear G3 on S2 teeth 20 width 6 z 6
gear G4 on S3 teeth 80 width 6 z 6
rack R1 teeth 20 width 6
mesh G1 G2 angle 0
mesh G3 G4 angle 90
mesh G4 R1 angle 90
`);
    // S3 also drives the rack, so the rack is the train's only output
    const html = specHtml(p, solve(p), '0');
    expect(html).toMatch(/Outputs/);
    expect(html).toMatch(/R1<\/td><td>-?[0-9.]+ mm\/s/);
    expect(html).not.toMatch(/<td>S3<\/td><td>125 rpm/);
    const noRack = project(serializeGear({ ...p, racks: [], meshes: p.meshes.slice(0, 2) }));
    const html2 = specHtml(noRack, solve(noRack), '0');
    expect(html2).toMatch(/<td>S3<\/td><td>125 rpm<\/td><td>8 : 1<\/td>/);
  });
});

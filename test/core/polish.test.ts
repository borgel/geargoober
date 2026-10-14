import { describe, expect, it } from 'vitest';
import { exportBundle } from '../../src/core/export/bundle';
import { gearsCsv } from '../../src/core/export/csv';
import { layoutDxf } from '../../src/core/export/dxf';
import { fusionScript } from '../../src/core/export/fusion';
import { partStep } from '../../src/core/export/step';
import { parseGear, serializeGear } from '../../src/core/format/gearText';
import { boreLoop } from '../../src/core/geometry/bore';
import { partProfile } from '../../src/core/geometry/parts';
import { loopArea, pointInPolygon, sampleLoop } from '../../src/core/geometry/sample';
import { solve } from '../../src/core/solver';
import { expectClosed } from '../helpers/geom';
import { measureStep } from '../helpers/occt';
import { project, solveText } from '../helpers/project';
import { runPython } from '../helpers/python';

describe('polish: solver', () => {
  it('reports an ignored rack mesh angle once', () => {
    const s = solveText(`
input S1 rpm 1
shaft S1 bore round 3
shaft S2 bore round 3
gear G1 on S1 teeth 20 width 5
gear G2 on S2 teeth 10 width 5
rack R teeth 40 width 5
mesh G1 R angle 270
mesh G2 R angle 10 offset 30
`);
    expect(s.issues.filter((i) => /angle 10° ignored/.test(i.message))).toHaveLength(1);
  });
});

describe('polish: kerf error wording', () => {
  it('names the kerf, the fillet and the largest kerf that fits', () => {
    const p = project('pitch module 1\nfit kerf 3\ninput S1 rpm 1\nshaft S1 bore round 10\ngear G on S1 teeth 40 width 5\n');
    const r = partProfile(p, solve(p), 'G', { kerf: true });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/kerf 3 mm/);
    expect(r.error).toMatch(/0\.38 mm/);
    expect(r.error).toMatch(/largest kerf that fits is 0\.76 mm/);
  });
});

describe('polish: ids and file names', () => {
  it('rejects ids the exporters cannot use', () => {
    const r = parseGear('shaft S/1 bore round 5\n');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].message).toMatch(/id/i);
  });
});

describe('polish: Fusion script', () => {
  const p = project(`
input S1 rpm 10
shaft S1 bore round 5
shaft S2 bore round 5
gear G-1 on S1 teeth 20 width 5
gear G_1 on S2 teeth 20 width 6
gear G3 on S1 teeth 20 width 5 z 6
gear G4 on S2 teeth 20 width 5 z 6
mesh G-1 G_1 angle 0
mesh G3 G4 angle 0
`);
  const py = fusionScript(p, solve(p), '0');

  it('gives colliding parameter names distinct suffixes', () => {
    expect(py).toContain('("G_1_face", "5 mm"');
    expect(py).toContain('("G_1_2_face", "6 mm"');
  });

  it('links each shaft pair once', () => {
    const links = py.slice(py.indexOf('LINKS = ['), py.indexOf(']', py.indexOf('LINKS = [')));
    expect(links.match(/\("S1", "S2"\)/g)).toHaveLength(1);
  });

  it('removes stale tagged points and lines and stays valid python', () => {
    expect(py).toContain('deleteMe()');
    const ok = runPython('import ast,sys,json; ast.parse(open(sys.argv[1]).read()); print(json.dumps(True))', py, 'py');
    expect(ok).toBe(true);
  });
});

describe('polish: text encoding in exports', () => {
  const p = project('project "Café \\\\ test"\ninput S1 rpm 1\nshaft S1 bore round 3\ngear G1 name "Zahnräder\\\\1" on S1 teeth 20 width 5\n');
  const s = solve(p);

  it('escapes backslashes and non-ASCII in STEP strings', () => {
    const step = partStep(p, s, 'G1', { kerf: false });
    expect(step).toContain("'Zahnr_der\\\\1'");
    expect(/[^\x00-\x7e]/.test(step)).toBe(false);
  });

  it('encodes non-ASCII DXF text as \\U+ escapes', () => {
    const p2 = project('input S1 rpm 1\nshaft S1 bore round 3\ngear G1 on S1 teeth 20 width 5\n');
    p2.gears[0].id = 'Gé';
    p2.shafts[0].id = 'S1';
    const dxf = layoutDxf(p2, solve(p2), { kerf: false });
    expect(/[^\x00-\x7e]/.test(dxf)).toBe(false);
    expect(dxf).toContain('G\\U+00E9');
  });

  it('neutralizes spreadsheet formulas in CSV text but keeps numbers', () => {
    const q = project('input S1 rpm -500\nshaft S1 bore round 3\ngear G1 name "=HYPERLINK(1)" on S1 teeth 20 width 5\n');
    const csv = gearsCsv(q, solve(q));
    expect(csv).toContain("'=HYPERLINK(1)");
    expect(csv).toContain(',-500,');
  });
});

describe('polish: dog-bone corner relief', () => {
  it('round-trips relief_style in the text format', () => {
    const r = parseGear('fit relief 0.5 relief_style dogbone\n');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.project.fit.reliefStyle).toBe('dogbone');
    expect(serializeGear(r.project)).toContain('relief_style dogbone');
    const plain = parseGear('');
    expect(plain.ok && plain.project.fit.reliefStyle).toBe('fillet');
  });

  for (const bore of [
    { kind: 'square' as const, side: 5 },
    { kind: 'hex' as const, acrossFlats: 6.35 },
  ]) {
    it(`clears every sharp corner of a ${bore.kind} shaft`, () => {
      const loop = boreLoop(bore, { relief: 0.4, style: 'dogbone' });
      expectClosed(loop);
      expect(loopArea(loop)).toBeLessThan(0);
      const poly = sampleLoop(loop, 0.0005);
      const corners =
        bore.kind === 'square'
          ? [
              [2.5, 2.5],
              [-2.5, 2.5],
              [-2.5, -2.5],
              [2.5, -2.5],
            ]
          : Array.from({ length: 6 }, (_, i) => [(6.35 / Math.sqrt(3)) * Math.cos((i * Math.PI) / 3), (6.35 / Math.sqrt(3)) * Math.sin((i * Math.PI) / 3)]);
      for (const [x, y] of corners) expect(pointInPolygon({ x: x * 0.999, y: y * 0.999 }, poly)).toBe(true);
      // fillet style does not clear the sharp corner
      const fillet = sampleLoop(boreLoop(bore, { relief: 0.4, style: 'fillet' }), 0.0005);
      expect(pointInPolygon({ x: corners[0][0] * 0.999, y: corners[0][1] * 0.999 }, fillet)).toBe(false);
    });
  }

  it('limits dog-bone radius to what the bore edges can hold', () => {
    const s = solveText('fit relief 2 relief_style dogbone\ninput S1 rpm 1\nshaft S1 bore square 5\ngear G on S1 teeth 40 width 5\n');
    expect(s.issues.some((i) => i.severity === 'error' && /relief/.test(i.message))).toBe(true);
  });

  it('exports a valid STEP solid with dog-bone bore', { timeout: 60_000 }, async () => {
    const p = project('fit relief 0.4 relief_style dogbone\ninput S1 rpm 1\nshaft S1 bore hex 6.35\ngear G on S1 teeth 30 width 5\n');
    const s = solve(p);
    const prof = partProfile(p, s, 'G', { kerf: false });
    if (!prof.ok) throw new Error(prof.error);
    const m = await measureStep(partStep(p, s, 'G', { kerf: false }));
    const expected = (loopArea(prof.profile.outer) + loopArea(prof.profile.holes[0])) * 5;
    expect(m.meshes).toBe(1);
    expect(Math.abs(m.volume - expected) / expected).toBeLessThan(0.001);
  });

  it('applies kerf to a dog-bone bore', () => {
    const p = project('fit kerf 0.2 relief 0.4 relief_style dogbone\ninput S1 rpm 1\nshaft S1 bore square 5\ngear G on S1 teeth 40 width 5\n');
    const b = exportBundle(p, solve(p), { kerfDxf: true, kerfStep: true, version: '0' });
    expect(b.errors).toEqual([]);
  });
});

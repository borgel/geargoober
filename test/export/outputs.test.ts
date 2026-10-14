import { unzipSync, strFromU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { exportBundle, zipBundle } from '../../src/core/export/bundle';
import { gearsCsv } from '../../src/core/export/csv';
import { fusionScript, paramName } from '../../src/core/export/fusion';
import { layoutSvg, specHtml } from '../../src/core/export/spec';
import { EXAMPLE_GEAR } from '../../src/core/example';
import { parseGear } from '../../src/core/format/gearText';
import { profileToPath } from '../../src/core/geometry/svgpath';
import { solve } from '../../src/core/solver';
import { project } from '../helpers/project';
import { runPython } from '../helpers/python';

const P = project(`
project "Test <script>alert(1)</script> train"
input S1 rpm 1000
shaft S1 bore round 5
shaft S2 bore hex 6.35
gear G1 on S1 teeth 20 width 6
gear G2 on S2 teeth 40 width 6
rack R1 teeth 20 width 6
mesh G1 G2 angle 0
mesh G2 R1 angle 270
`);
const S = solve(P);

describe('fusionScript', () => {
  const py = fusionScript(P, S, '0.1.0');

  it('is valid python', () => {
    const r = runPython('import ast,sys,json; ast.parse(open(sys.argv[1]).read()); print(json.dumps(True))', py, 'py');
    expect(r).toBe(true);
  });

  it('defines parameters with values in mm', () => {
    expect(py).toContain('("gt_module", "1 mm"');
    expect(py).toContain('("gt_pa", "20 deg"');
    expect(py).toContain('("cd_G1_G2", "30 mm"');
    expect(py).toContain('("S2_x", "30 mm"');
    expect(py).toContain('("G1_face", "6 mm"');
    expect(py).toContain('GearTrain Layout');
  });

  it('converts sketch coordinates to Fusion cm', () => {
    expect(py).toMatch(/\/ 10\.0/);
  });

  it('sanitizes ids into parameter names', () => {
    expect(paramName('G-1')).toBe('G_1');
    expect(paramName('1st')).toBe('p_1st');
  });

  it('keeps the project name out of code', () => {
    expect(py).not.toMatch(/^[^#\n]*alert\(1\)/m);
  });
});

describe('specHtml', () => {
  const html = specHtml(P, S, '0.1.0');
  it('lists every part', () => {
    for (const id of ['S1', 'S2', 'G1', 'G2', 'R1']) expect(html).toContain(`>${id}<`);
  });
  it('escapes user text', () => {
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
  it('embeds the layout svg', () => {
    expect(html).toContain('<svg');
    expect(layoutSvg(P, S)).toContain('<path');
  });
  it('shows center distance and speeds', () => {
    expect(html).toContain('30.000');
    expect(html).toContain('-500');
  });
});

describe('gearsCsv', () => {
  it('has a header and one row per gear', () => {
    const lines = gearsCsv(P, S).trim().split('\n');
    expect(lines[0]).toBe('id,name,shaft,teeth,module,pitch_dia,outer_dia,root_dia,face_width,z_offset,x,y,rpm,phase_deg');
    expect(lines).toHaveLength(3);
    expect(lines[2].split(',')[0]).toBe('G2');
  });
});

describe('profileToPath', () => {
  it('writes move, line, arc and curve commands', () => {
    const d = profileToPath({
      outer: [
        { kind: 'line', a: { x: 0, y: 0 }, b: { x: 1, y: 0 } },
        { kind: 'arc', center: { x: 0, y: 0 }, r: 1, start: 0, end: Math.PI / 2 },
        { kind: 'bezier', p: [{ x: 0, y: 1 }, { x: 0, y: 0.5 }, { x: 0, y: 0.25 }, { x: 0, y: 0 }] },
      ],
      holes: [],
    });
    expect(d).toMatch(/^M0 0L1 0A1 1 0 0 1 0 1C/);
    expect(d.endsWith('Z')).toBe(true);
  });
});

describe('exportBundle', () => {
  it('names files and zips them', () => {
    const b = exportBundle(P, S, { kerfDxf: true, kerfStep: false, version: '0.1.0' });
    expect(b.errors).toEqual([]);
    const names = b.files.map((f) => f.name).sort();
    expect(names).toEqual(
      [
        'G1_z20_m1.dxf',
        'G1_z20_m1.step',
        'G2_z40_m1.dxf',
        'G2_z40_m1.step',
        'R1_n20_m1.dxf',
        'R1_n20_m1.step',
        'geartrain.csv',
        'geartrain.json',
        'geartrain_params.py',
        'layout.dxf',
        'project.gear',
        'spec.html',
      ].sort(),
    );
    const unzipped = unzipSync(zipBundle(b.files));
    expect(Object.keys(unzipped).sort()).toEqual(names);
    expect(strFromU8(unzipped['project.gear'])).toContain('gear  G1');
  });

  it('refuses to export when the solver has errors', () => {
    const bad = project('input S1 rpm 1\nshaft S1 bore round 5\ngear G1 on S1 teeth 3 width 5\n');
    const b = exportBundle(bad, solve(bad), { kerfDxf: false, kerfStep: false, version: '0' });
    expect(b.files).toEqual([]);
    expect(b.errors.length).toBeGreaterThan(0);
  });

  it('reports parts whose kerf cannot be applied but still exports the rest', () => {
    const p = project('pitch module 0.3\nfit kerf 0.4 backlash 0.02\ninput S1 rpm 1\nshaft S1 bore round 1\ngear G on S1 teeth 20 width 5\n');
    const b = exportBundle(p, solve(p), { kerfDxf: true, kerfStep: false, version: '0' });
    expect(b.errors.some((e) => e.part === 'G')).toBe(true);
    expect(b.files.some((f) => f.name === 'G_z20_m0.3.step')).toBe(true);
    expect(b.files.some((f) => f.name === 'G_z20_m0.3.dxf')).toBe(false);
  });

  it('names DP projects by diametral pitch', () => {
    const p = project('pitch dp 24\ninput S1 rpm 1\nshaft S1 bore round 3\ngear G on S1 teeth 20 width 5\n');
    const b = exportBundle(p, solve(p), { kerfDxf: false, kerfStep: false, version: '0' });
    expect(b.files.some((f) => f.name === 'G_z20_dp24.dxf')).toBe(true);
  });
});

describe('EXAMPLE_GEAR', () => {
  it('parses and solves without errors', () => {
    const r = parseGear(EXAMPLE_GEAR);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const s = solve(r.project);
    expect(s.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(s.shafts.every((x) => x.rpm !== undefined)).toBe(true);
  });
});

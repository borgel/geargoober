import { describe, expect, it } from 'vitest';
import { layoutDxf, partDxf } from '../../src/core/export/dxf';
import { partProfile } from '../../src/core/geometry/parts';
import { segPoint } from '../../src/core/geometry/sample';
import { solve } from '../../src/core/solver';
import { project } from '../helpers/project';
import { runPython } from '../helpers/python';

const AUDIT = `
import sys, json, ezdxf
from collections import Counter
doc = ezdxf.readfile(sys.argv[1])
aud = doc.audit()
msp = doc.modelspace()
print(json.dumps({
  "errors": [str(e.message) for e in aud.errors],
  "fixes": len(aud.fixes),
  "units": doc.units,
  "version": doc.dxfversion,
  "types": Counter(e.dxftype() for e in msp),
  "layers": sorted(set(e.dxf.layer for e in msp)),
}))
`;

const P = project(`
input S1 rpm 100
fit kerf 0.2
shaft S1 bore hex 6.35
shaft S2 bore dflat 5 0.5
gear G1 on S1 teeth 12 width 6
gear G2 on S2 teeth 30 width 6
rack R1 teeth 10 width 6
mesh G1 G2 angle 30
mesh G2 R1 angle 270
`);
const S = solve(P);

describe('partDxf', () => {
  it('writes R2000 with mm units and passes ezdxf audit', () => {
    const dxf = partDxf(P, S, 'G1', { kerf: false });
    expect(dxf).toContain('AC1015');
    const r = runPython(AUDIT, dxf, 'dxf');
    expect(r.errors).toEqual([]);
    expect(r.fixes).toBe(0);
    expect(r.units).toBe(4);
    expect(r.version).toBe('AC1015');
    expect(r.layers).toEqual(['BORE', 'CENTER', 'PITCH_CIRCLE', 'PROFILE']);
  });

  it('writes one entity per profile segment', () => {
    const dxf = partDxf(P, S, 'G2', { kerf: false });
    const prof = partProfile(P, S, 'G2', { kerf: false });
    if (!prof.ok) throw new Error(prof.error);
    const segs = [...prof.profile.outer, ...prof.profile.holes.flat()];
    const want = { LINE: 0, ARC: 0, SPLINE: 0 };
    for (const s of segs) want[s.kind === 'line' ? 'LINE' : s.kind === 'arc' ? 'ARC' : 'SPLINE']++;
    const r = runPython(AUDIT, dxf, 'dxf');
    expect(r.types.SPLINE).toBe(want.SPLINE);
    expect(r.types.ARC).toBe(want.ARC);
    // + 2 center-mark lines
    expect(r.types.LINE).toBe(want.LINE + 2);
    expect(r.types.CIRCLE).toBe(1); // pitch circle
    expect(r.types.POINT).toBe(1);
  });

  it('applies kerf when asked', () => {
    expect(partDxf(P, S, 'G1', { kerf: true })).not.toEqual(partDxf(P, S, 'G1', { kerf: false }));
  });

  it('writes a rack with a pitch line', () => {
    const r = runPython(AUDIT, partDxf(P, S, 'R1', { kerf: false }), 'dxf');
    expect(r.errors).toEqual([]);
    expect(r.layers).toContain('PITCH_CIRCLE');
  });

  it('reproduces arc direction for clockwise arcs (fillets, bores)', () => {
    // DXF arcs are always CCW; a clockwise source arc must cover the same points after the swap
    const ARCS = `
import sys, json, ezdxf, math
doc = ezdxf.readfile(sys.argv[1])
out = []
for e in doc.modelspace().query('ARC'):
    a0 = math.radians(e.dxf.start_angle)
    a1 = math.radians(e.dxf.end_angle)
    sweep = (a1 - a0) % (2 * math.pi)
    mid = a0 + sweep / 2
    out.append([e.dxf.center.x + e.dxf.radius * math.cos(mid), e.dxf.center.y + e.dxf.radius * math.sin(mid)])
print(json.dumps(out))
`;
    const mids: [number, number][] = runPython(ARCS, partDxf(P, S, 'G2', { kerf: false }), 'dxf');
    const prof = partProfile(P, S, 'G2', { kerf: false });
    if (!prof.ok) throw new Error(prof.error);
    const arcs = [...prof.profile.outer, ...prof.profile.holes.flat()].filter((x) => x.kind === 'arc');
    expect(mids).toHaveLength(arcs.length);
    arcs.forEach((a, i) => {
      const want = segPoint(a, 0.5);
      expect(Math.hypot(mids[i][0] - want.x, mids[i][1] - want.y)).toBeLessThan(1e-6);
    });
  });
});

describe('layoutDxf', () => {
  it('places every part and marks shafts', () => {
    const r = runPython(AUDIT, layoutDxf(P, S, { kerf: false }), 'dxf');
    expect(r.errors).toEqual([]);
    expect(r.types.POINT).toBe(2);
    expect(r.layers).toEqual(['BORE', 'DIMENSIONS', 'LABELS', 'PITCH_CIRCLE', 'PROFILE', 'SHAFTS']);
    expect(r.types.TEXT).toBeGreaterThanOrEqual(3 + 1); // part labels + one center-distance label
  });

  it('labels center distances', () => {
    expect(layoutDxf(P, S, { kerf: false })).toContain('cd 21.000');
  });
});

import { describe, expect, it } from 'vitest';
import { addMesh } from '../../src/core/edit';
import { parseGear } from '../../src/core/format/gearText';
import { suggestMeshAngle } from '../../src/core/meshAngle';
import type { Project } from '../../src/core/model';
import { solve } from '../../src/core/solver';

const parsed = (text: string): Project => {
  const r = parseGear(text);
  if (!r.ok) throw new Error(r.errors.map((e) => e.message).join('; '));
  return r.project;
};
const overlaps = (p: Project) => solve(p).issues.filter((i) => /overlap|passes over/.test(i.message) && !/in z/.test(i.message));

const BASE = `input S1 rpm 100
shaft S1 bore round 3
shaft S2 bore round 3
shaft S3 bore round 3
`;

describe('suggestMeshAngle', () => {
  it('continues a chain away from the rest of the train', () => {
    const p = parsed(BASE + 'gear G1 on S1 teeth 20 width 5\ngear G2 on S2 teeth 20 width 5\ngear G3 on S3 teeth 20 width 5\nmesh G1 G2 angle 0\nmesh G2 G3 angle 0\n');
    expect(suggestMeshAngle(p, 1)).toBe(0);
  });

  it('moves a new gear out from under a big gear’s existing mate', () => {
    // G2 already sits at +x of the big G1; a new G3 at angle 0 would land right on top of it.
    const p = parsed(BASE + 'gear G1 on S1 teeth 60 width 5\ngear G2 on S2 teeth 20 width 5\ngear G3 on S3 teeth 12 width 5\nmesh G1 G2 angle 0\nmesh G1 G3 angle 0\n');
    expect(overlaps(p).length).toBeGreaterThan(0);
    const angle = suggestMeshAngle(p, 1)!;
    expect(angle).toBe(180);
    p.meshes[1].angleDeg = angle;
    expect(overlaps(p)).toEqual([]);
  });

  it('finds a clear spot when the preferred direction is blocked', () => {
    // G1 has mates at 0° and 180°; G4 must go somewhere else.
    const p = parsed(
      BASE +
        'shaft S4 bore round 3\ngear G1 on S1 teeth 40 width 5\ngear G2 on S2 teeth 30 width 5\ngear G3 on S3 teeth 30 width 5\ngear G4 on S4 teeth 30 width 5\n' +
        'mesh G1 G2 angle 0\nmesh G1 G3 angle 180\nmesh G1 G4 angle 0\n',
    );
    const angle = suggestMeshAngle(p, 2)!;
    p.meshes[2].angleDeg = angle;
    expect(overlaps(p)).toEqual([]);
    expect(angle % 5).toBe(0);
    expect(angle).toBeGreaterThanOrEqual(0);
    expect(angle).toBeLessThan(360);
  });

  it('keeps the actual direction when both gears are already placed', () => {
    const p = parsed(
      BASE + 'gear G1 on S1 teeth 20 width 5\ngear G2 on S2 teeth 20 width 5\ngear G3 on S3 teeth 20 width 5\nmesh G1 G2 angle 0\nmesh G2 G3 angle 60\nmesh G3 G1 angle 0\n',
    );
    // G1 (0,0), G2 (20,0), G3 at 60° from G2: (30, 17.3); G3 → G1 points to 210°
    expect(suggestMeshAngle(p, 2)).toBe(210);
  });

  it('leaves rack meshes and unfinished meshes alone', () => {
    const p = parsed(BASE + 'gear G1 on S1 teeth 20 width 5\nrack R1 teeth 20 width 5\nmesh G1 R1 angle 90\n');
    expect(suggestMeshAngle(p, 0)).toBeUndefined();
    p.meshes[0].b = '';
    expect(suggestMeshAngle(p, 0)).toBeUndefined();
  });
});

describe('addMesh', () => {
  it('places the new mesh where nothing overlaps', () => {
    // addMesh pairs the last two gears: big G1 and new G3. Angle 0 would put G3 on G2.
    const p = parsed(BASE + 'gear G2 on S2 teeth 20 width 5\ngear G1 on S1 teeth 60 width 5\nmesh G1 G2 angle 0\ngear G3 on S3 teeth 12 width 5\n');
    const r = addMesh(p);
    expect(r.meshes[1]).toMatchObject({ a: 'G1', b: 'G3', angleDeg: 180 });
    expect(overlaps(r)).toEqual([]);
  });
});

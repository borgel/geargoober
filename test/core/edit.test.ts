import { describe, expect, it } from 'vitest';
import { addGear, addMesh, addRack, addShaft, nextId, removeMesh, removePart, renameId } from '../../src/core/edit';
import { newProject } from '../../src/core/model';
import { project } from '../helpers/project';

const BASE = `
input S1 rpm 100
shaft S1 bore round 5
shaft S2 bore round 5
gear G1 on S1 teeth 20 width 6
gear G2 on S2 teeth 40 width 6
rack R1 teeth 10 width 6
mesh G1 G2 angle 0
mesh G2 R1 angle 270
`;

describe('project edits', () => {
  it('finds the next free id', () => {
    expect(nextId(project(BASE), 'S')).toBe('S3');
    expect(nextId(newProject(), 'G')).toBe('G1');
  });

  it('adds a first shaft and makes it the input', () => {
    const p = addShaft(newProject());
    expect(p.shafts[0]).toEqual({ id: 'S1', name: 'S1', bore: { kind: 'round', dia: 5 } });
    expect(p.input).toEqual({ kind: 'shaft', shaftId: 'S1', rpm: 100 });
  });

  it('adds a gear on its own new shaft', () => {
    const p = addGear(project(BASE));
    const g = p.gears[p.gears.length - 1];
    expect(g).toMatchObject({ id: 'G3', shaftId: 'S3', teeth: 20 });
    expect(p.shafts.map((s) => s.id)).toContain('S3');
  });

  it('adds a rack and a mesh between the last two gears', () => {
    expect(addRack(project(BASE)).racks.map((r) => r.id)).toEqual(['R1', 'R2']);
    const p = addMesh(addGear(project(BASE)));
    expect(p.meshes[p.meshes.length - 1]).toEqual({ a: 'G2', b: 'G3', angleDeg: 0 });
  });

  it('does not mutate its input', () => {
    const p = project(BASE);
    const before = JSON.stringify(p);
    addGear(p);
    renameId(p, 'S1', 'M');
    removePart(p, 'S2');
    expect(JSON.stringify(p)).toBe(before);
  });

  it('renames a shaft and its references', () => {
    const p = renameId(project(BASE), 'S1', 'Motor');
    expect(p.shafts[0].id).toBe('Motor');
    expect(p.gears[0].shaftId).toBe('Motor');
    expect(p.input).toEqual({ kind: 'shaft', shaftId: 'Motor', rpm: 100 });
  });

  it('renames gears and racks in meshes and input', () => {
    let p = renameId(project(BASE), 'G2', 'Big');
    expect(p.meshes).toEqual([
      { a: 'G1', b: 'Big', angleDeg: 0 },
      { a: 'Big', b: 'R1', angleDeg: 270 },
    ]);
    p = renameId({ ...p, input: { kind: 'rack', rackId: 'R1', mmPerSec: 5 } }, 'R1', 'Slide');
    expect(p.meshes[1].b).toBe('Slide');
    expect(p.input).toEqual({ kind: 'rack', rackId: 'Slide', mmPerSec: 5 });
  });

  it('keeps the old name when it equalled the id', () => {
    expect(renameId(project(BASE), 'G1', 'P').gears[0].name).toBe('P');
  });

  it('removes a shaft with its gears and their meshes', () => {
    const p = removePart(project(BASE), 'S2');
    expect(p.shafts.map((s) => s.id)).toEqual(['S1']);
    expect(p.gears.map((g) => g.id)).toEqual(['G1']);
    expect(p.meshes).toEqual([]);
  });

  it('removes a rack and its meshes, and a mesh by index', () => {
    expect(removePart(project(BASE), 'R1').meshes).toHaveLength(1);
    expect(removeMesh(project(BASE), 0).meshes).toEqual([{ a: 'G2', b: 'R1', angleDeg: 270 }]);
  });
});

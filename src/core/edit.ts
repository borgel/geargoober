// Immutable project edits used by the list editor.
import { ID_PATTERN, type Project } from './model';

const clone = (p: Project): Project => structuredClone(p);

export function nextId(p: Project, prefix: string): string {
  const used = new Set([...p.shafts, ...p.gears, ...p.racks].map((x) => x.id));
  let n = 1;
  while (used.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

export function addShaft(p: Project): Project {
  const q = clone(p);
  const id = nextId(q, 'S');
  q.shafts.push({ id, name: id, bore: { kind: 'round', dia: 5 } });
  if (q.input.kind === 'shaft' && !q.input.shaftId) q.input = { kind: 'shaft', shaftId: id, rpm: 100 };
  return q;
}

/** Adds a 20-tooth gear on a new shaft (move it to a shared shaft for a compound gear). */
export function addGear(p: Project): Project {
  const q = addShaft(p);
  const shaftId = q.shafts[q.shafts.length - 1].id;
  const id = nextId(q, 'G');
  const width = q.gears[q.gears.length - 1]?.faceWidth ?? 6;
  q.gears.push({ id, name: id, shaftId, teeth: 20, faceWidth: width, zOffset: 0 });
  return q;
}

export function addRack(p: Project): Project {
  const q = clone(p);
  const id = nextId(q, 'R');
  q.racks.push({ id, name: id, teeth: 20, faceWidth: q.gears[0]?.faceWidth ?? 6, backHeight: 5 });
  return q;
}

/** Adds a mesh between the two most recently added gears (or the last gear and a rack). */
export function addMesh(p: Project): Project {
  const q = clone(p);
  const g = q.gears;
  const a = g[g.length - 2]?.id ?? g[0]?.id ?? '';
  const b = g.length >= 2 ? g[g.length - 1].id : (q.racks[0]?.id ?? '');
  q.meshes.push({ a, b, angleDeg: 0 });
  return q;
}

export { ID_PATTERN };
export const isValidId = (id: string): boolean => ID_PATTERN.test(id);

/** Renames a part and every reference to it. Invalid or already-used targets leave the project unchanged. */
export function renameId(p: Project, from: string, to: string): Project {
  const taken = [...p.shafts, ...p.gears, ...p.racks].some((x) => x.id === to);
  if (!isValidId(to) || taken) return p;
  const q = clone(p);
  const swap = (x: string) => (x === from ? to : x);
  for (const list of [q.shafts, q.gears, q.racks]) {
    for (const item of list) {
      if (item.id !== from) continue;
      if (item.name === item.id) item.name = to;
      item.id = to;
    }
  }
  for (const g of q.gears) g.shaftId = swap(g.shaftId);
  for (const m of q.meshes) {
    m.a = swap(m.a);
    m.b = swap(m.b);
  }
  if (q.input.kind === 'shaft') q.input.shaftId = swap(q.input.shaftId);
  else q.input.rackId = swap(q.input.rackId);
  return q;
}

/** Removes a shaft (with its gears), gear or rack, plus every mesh that referenced a removed part. */
export function removePart(p: Project, id: string): Project {
  const q = clone(p);
  const gone = new Set([id, ...q.gears.filter((g) => g.shaftId === id).map((g) => g.id)]);
  q.shafts = q.shafts.filter((s) => s.id !== id);
  q.gears = q.gears.filter((g) => !gone.has(g.id));
  q.racks = q.racks.filter((r) => r.id !== id);
  q.meshes = q.meshes.filter((m) => !gone.has(m.a) && !gone.has(m.b));
  return q;
}

export function removeMesh(p: Project, index: number): Project {
  const q = clone(p);
  q.meshes.splice(index, 1);
  return q;
}

// Solves a gear train: shaft speeds, layout positions, tooth phases, and design issues.
// Pure and total: user-caused problems are reported as issues, never thrown.
import {
  contactRatioGears,
  contactRatioRack,
  radii,
  toothTipHalfAngle,
  undercutLimit,
  type ToothParams,
} from './gearmath';
import { boreRadius, type Bore, type Gear, type Project, type Rack } from './model';
import { DEG, moduleOf } from './units';
import { add, dist, dot, polar, rot, scale, sub, type Vec2 } from './vec';

export interface Issue {
  severity: 'error' | 'warning';
  message: string;
  refs: string[];
}

export interface ShaftSol {
  id: string;
  x: number;
  y: number;
  rpm?: number;
  dir?: 'cw' | 'ccw' | 'stopped';
  torqueRatio?: number;
}

export interface GearSol {
  id: string;
  shaftId: string;
  z: number;
  pitchR: number;
  outerR: number;
  rootR: number;
  baseR: number;
  /** Rotation of tooth 0's center line from +x, radians. */
  phase: number;
  x: number;
  y: number;
  rpm?: number;
  surfaceSpeed?: number;
}

export interface RackSol {
  id: string;
  /** World position of rack-local (0,0): the pitch line at the rack's middle. */
  origin: Vec2;
  /** Direction of rack-local +x, radians. Rack-local +y (toward meshing gears) is angle + 90°. */
  angle: number;
  length: number;
  pitch: number;
  /** Rack-local x of tooth 0's center. */
  x0: number;
  mmPerSec?: number;
}

export interface MeshSol {
  a: string;
  b: string;
  /** Gear–gear: center distance. Gear–rack: gear center to rack pitch line. */
  centerDist: number;
  /** zb / za (speed reduction a → b); NaN for racks. */
  ratio: number;
  contactRatio: number;
  /** Rack meshes: rack-local x of the contact point. */
  contactX?: number;
}

export interface Solution {
  ok: boolean;
  module: number;
  pa: number;
  shafts: ShaftSol[];
  gears: GearSol[];
  racks: RackSol[];
  meshes: MeshSol[];
  issues: Issue[];
}

const TAU = 2 * Math.PI;
const POS_TOL = 0.01;
const frac = (x: number) => x - Math.floor(x);
const normAngle = (a: number) => ((a % TAU) + TAU) % TAU;
const isPos = (n: number) => Number.isFinite(n) && n > 0;
const fmt = (n: number) => n.toFixed(3);

function boreProblem(b: Bore): string | undefined {
  switch (b.kind) {
    case 'round':
      return isPos(b.dia) ? undefined : 'bore diameter must be > 0';
    case 'dflat':
      if (!isPos(b.dia)) return 'bore diameter must be > 0';
      return isPos(b.flatDepth) && b.flatDepth < b.dia / 2 ? undefined : 'D-flat depth must be between 0 and the bore radius';
    case 'hex':
      return isPos(b.acrossFlats) ? undefined : 'hex across-flats must be > 0';
    case 'square':
      return isPos(b.side) ? undefined : 'square side must be > 0';
  }
}

export function solve(p: Project): Solution {
  const issues: Issue[] = [];
  const err = (message: string, ...refs: string[]) => issues.push({ severity: 'error', message, refs });
  const warn = (message: string, ...refs: string[]) => issues.push({ severity: 'warning', message, refs });

  const m = moduleOf(p);
  const pa = p.pressureAngleDeg * DEG;
  const { backlashMm: backlash, clearanceCoef } = p.fit;

  // ---- validation -------------------------------------------------------
  if (!isPos(m)) err(`pitch must be a positive number (module ${m})`);
  if (!(pa > 0 && pa < 45 * DEG)) err('pressure angle must be between 0° and 45°');
  if (!(backlash >= 0) || (isPos(m) && backlash >= (Math.PI * m) / 2)) err('backlash must be ≥ 0 and less than half the circular pitch');
  if (!(clearanceCoef >= 0 && clearanceCoef < 1)) err('clearance coefficient must be between 0 and 1');
  if (!(p.fit.kerfMm >= 0)) err('kerf must be ≥ 0');
  if (!(p.fit.cornerReliefMm >= 0)) err('corner relief must be ≥ 0');

  const shaftById = new Map(p.shafts.map((s) => [s.id, s]));
  const gearById = new Map(p.gears.map((g) => [g.id, g]));
  const rackById = new Map(p.racks.map((r) => [r.id, r]));

  for (const s of p.shafts) {
    const problem = boreProblem(s.bore);
    if (problem) err(`${s.id}: ${problem}`, s.id);
  }
  for (const g of p.gears) {
    if (!shaftById.has(g.shaftId)) err(`${g.id}: unknown shaft "${g.shaftId}"`, g.id, g.shaftId);
    if (!Number.isInteger(g.teeth) || g.teeth < 4) err(`${g.id}: teeth must be a whole number ≥ 4`, g.id);
    if (!isPos(g.faceWidth)) err(`${g.id}: face width must be > 0`, g.id);
    if (!Number.isFinite(g.zOffset)) err(`${g.id}: z offset must be a number`, g.id);
  }
  for (const r of p.racks) {
    if (!Number.isInteger(r.teeth) || r.teeth < 1) err(`${r.id}: teeth must be a whole number ≥ 1`, r.id);
    if (!isPos(r.faceWidth)) err(`${r.id}: face width must be > 0`, r.id);
    if (!isPos(r.backHeight)) err(`${r.id}: back height must be > 0`, r.id);
  }
  const pairs = new Set<string>();
  for (const mesh of p.meshes) {
    const label = `mesh ${mesh.a}–${mesh.b}`;
    const a = gearById.get(mesh.a);
    if (!a) {
      if (rackById.has(mesh.a)) err(`${label}: the first member must be a gear (put the rack second)`, mesh.a);
      else err(`${label}: unknown gear "${mesh.a}"`, mesh.a);
    }
    const bGear = gearById.get(mesh.b);
    if (!bGear && !rackById.has(mesh.b)) err(`${label}: unknown gear or rack "${mesh.b}"`, mesh.b);
    if (mesh.a === mesh.b) err(`${label}: a gear cannot mesh with itself`, mesh.a);
    else if (a && bGear && a.shaftId === bGear.shaftId) err(`${label}: gears on the same shaft cannot mesh`, mesh.a, mesh.b);
    const key = [mesh.a, mesh.b].sort().join('|');
    if (pairs.has(key)) err(`${label}: duplicate mesh`, mesh.a, mesh.b);
    pairs.add(key);
    if (!Number.isFinite(mesh.angleDeg)) err(`${label}: angle must be a number`, mesh.a, mesh.b);
    if (mesh.offset !== undefined && !Number.isFinite(mesh.offset)) err(`${label}: offset must be a number`, mesh.a, mesh.b);
  }
  const input = p.input;
  if (input.kind === 'shaft') {
    if (!input.shaftId) err('no input: choose a driving shaft or rack');
    else if (!shaftById.has(input.shaftId)) err(`input: unknown shaft "${input.shaftId}"`, input.shaftId);
    if (!Number.isFinite(input.rpm)) err('input rpm must be a number');
  } else {
    if (!rackById.has(input.rackId)) err(`input: unknown rack "${input.rackId}"`, input.rackId);
    if (!Number.isFinite(input.mmPerSec)) err('input speed must be a number');
  }

  // ---- base solution ----------------------------------------------------
  const tp = (z: number): ToothParams => ({ m, z, paRad: pa, backlash, clearanceCoef });
  const pitch = Math.PI * m;
  const gears: GearSol[] = p.gears.map((g) => ({ id: g.id, shaftId: g.shaftId, z: g.teeth, ...radii(tp(g.teeth)), phase: 0, x: 0, y: 0 }));
  const shafts: ShaftSol[] = p.shafts.map((s) => ({ id: s.id, x: 0, y: 0 }));
  const racks: RackSol[] = p.racks.map((r) => ({
    id: r.id,
    origin: { x: 0, y: 0 },
    angle: 0,
    length: r.teeth * pitch,
    pitch,
    x0: (-(r.teeth - 1) / 2) * pitch,
  }));
  const meshes: MeshSol[] = [];
  const fail = (): Solution => ({ ok: false, module: m, pa, shafts, gears, racks, meshes, issues });
  if (issues.some((i) => i.severity === 'error')) return fail();

  const gearSol = new Map(gears.map((g) => [g.id, g]));
  const shaftSol = new Map(shafts.map((s) => [s.id, s]));
  const rackSol = new Map(racks.map((r) => [r.id, r]));
  const gearsOnShaft = new Map<string, Gear[]>(p.shafts.map((s) => [s.id, []]));
  for (const g of p.gears) gearsOnShaft.get(g.shaftId)!.push(g);
  const meshesOf = new Map<string, number[]>();
  p.meshes.forEach((mesh, i) => {
    for (const id of [mesh.a, mesh.b]) meshesOf.set(id, [...(meshesOf.get(id) ?? []), i]);
  });

  for (const mesh of p.meshes) {
    const a = gearById.get(mesh.a)!;
    const b = gearById.get(mesh.b);
    if (b) {
      const cd = (m * (a.teeth + b.teeth)) / 2;
      meshes.push({ a: a.id, b: b.id, centerDist: cd, ratio: b.teeth / a.teeth, contactRatio: contactRatioGears(tp(a.teeth), tp(b.teeth), cd) });
    } else {
      meshes.push({ a: a.id, b: mesh.b, centerDist: gearSol.get(a.id)!.pitchR, ratio: NaN, contactRatio: contactRatioRack(tp(a.teeth)) });
    }
  }

  // ---- layout and phases ------------------------------------------------
  type Node = { kind: 'shaft' | 'rack'; id: string };
  const placedShafts = new Set<string>();
  const placedRacks = new Set<string>();
  const phased = new Set<string>();
  const tau = (g: Gear) => TAU / g.teeth;
  const shaftPos = (id: string): Vec2 => shaftSol.get(id)!;
  const rackT = (r: RackSol) => polar(1, r.angle);
  const rackU = (r: RackSol) => rot(rackT(r), -Math.PI / 2); // gear center → pitch line

  const placeShaft = (id: string, pos: Vec2) => {
    const s = shaftSol.get(id)!;
    s.x = pos.x;
    s.y = pos.y;
    placedShafts.add(id);
  };

  const ensurePhase = (g: Gear) => {
    if (!phased.has(g.id)) phased.add(g.id);
  };

  const setPhase = (g: Gear, phase: number, via: string) => {
    const gs = gearSol.get(g.id)!;
    if (phased.has(g.id)) {
      const d = frac((gs.phase - phase) / tau(g) + 0.5) - 0.5;
      if (Math.abs(d) > 1e-6) warn(`${g.id}: teeth cannot be in phase with both ${via} and its other mates`, g.id, via);
      return;
    }
    gs.phase = normAngle(phase);
    phased.add(g.id);
  };

  const checkOrPlaceShaft = (shaftId: string, pos: Vec2, queue: Node[], ...refs: string[]) => {
    if (placedShafts.has(shaftId)) {
      const cur = shaftPos(shaftId);
      if (dist(cur, pos) > POS_TOL) {
        err(
          `position conflict: ${shaftId} is at (${fmt(cur.x)}, ${fmt(cur.y)}) but ${refs.join('–')} puts it at (${fmt(pos.x)}, ${fmt(pos.y)})`,
          shaftId,
          ...refs,
        );
      }
    } else {
      placeShaft(shaftId, pos);
      queue.push({ kind: 'shaft', id: shaftId });
    }
  };

  const meshAngleCheck = (meshIdx: number, actual: number) => {
    const mesh = p.meshes[meshIdx];
    const d = Math.abs(frac((mesh.angleDeg * DEG - actual) / TAU + 0.5) - 0.5) * 360;
    if (d > 0.01) warn(`mesh ${mesh.a}–${mesh.b}: angle ${mesh.angleDeg}° ignored; the rack fixes it at ${fmt(normAngle(actual) / DEG)}°`, mesh.a, mesh.b);
  };

  const fromGear = (x: Gear, meshIdx: number, queue: Node[]) => {
    const mesh = p.meshes[meshIdx];
    const xs = gearSol.get(x.id)!;
    const xPos = shaftPos(x.shaftId);
    ensurePhase(x);
    const otherId = mesh.a === x.id ? mesh.b : mesh.a;
    const y = gearById.get(otherId);
    if (y) {
      const beta = mesh.angleDeg * DEG + (mesh.a === x.id ? 0 : Math.PI);
      const cd = meshes[meshIdx].centerDist;
      checkOrPlaceShaft(y.shaftId, add(xPos, polar(cd, beta)), queue, x.id, y.id);
      const fX = frac((beta - xs.phase) / tau(x));
      setPhase(y, beta + Math.PI - (0.5 - fX) * tau(y), x.id);
      return;
    }
    // x is the pinion (mesh.a), other side is a rack
    const rack = rackById.get(otherId)!;
    const rs = rackSol.get(rack.id)!;
    const fX = frac((mesh.angleDeg * DEG - xs.phase) / tau(x));
    if (!placedRacks.has(rack.id)) {
      const beta = mesh.angleDeg * DEG;
      const u = polar(1, beta);
      const t = rot(u, Math.PI / 2);
      const c = add(xPos, scale(u, xs.pitchR));
      const k = Math.min(rack.teeth - 1, Math.max(-1, Math.round(-rs.x0 / pitch - 0.5 - fX)));
      const contactX = rs.x0 + (k + 0.5 + fX) * pitch;
      rs.origin = sub(c, scale(t, contactX));
      rs.angle = normAngle(beta + Math.PI / 2);
      placedRacks.add(rack.id);
      meshes[meshIdx].contactX = contactX;
      queue.push({ kind: 'rack', id: rack.id });
      return;
    }
    // rack already placed: check this pinion against it
    const t = rackT(rs);
    const u = rackU(rs);
    const contactX = dot(sub(xPos, rs.origin), t);
    meshes[meshIdx].contactX = contactX;
    const expected = sub(add(rs.origin, scale(t, contactX)), scale(u, xs.pitchR));
    if (dist(expected, xPos) > POS_TOL) {
      err(`position conflict: ${x.id} is not at pitch distance from rack ${rack.id}`, x.id, rack.id, x.shaftId);
    }
    meshAngleCheck(meshIdx, Math.atan2(u.y, u.x));
    const fR = frac((contactX - rs.x0) / pitch);
    const fXr = frac((Math.atan2(u.y, u.x) - xs.phase) / tau(x));
    if (Math.abs(frac(fR - fXr - 0.5 + 0.5) - 0.5) > 1e-6) {
      warn(`${x.id}: teeth cannot be in phase with rack ${rack.id} and its other mates`, x.id, rack.id);
    }
  };

  const fromRack = (rack: Rack, meshIdx: number, queue: Node[]) => {
    const mesh = p.meshes[meshIdx];
    const rs = rackSol.get(rack.id)!;
    const y = gearById.get(mesh.a)!;
    const ys = gearSol.get(y.id)!;
    const t = rackT(rs);
    const u = rackU(rs);
    const off = mesh.offset ?? 0;
    const c = add(rs.origin, scale(t, off));
    meshes[meshIdx].contactX = off;
    const beta = Math.atan2(u.y, u.x);
    meshAngleCheck(meshIdx, beta);
    checkOrPlaceShaft(y.shaftId, sub(c, scale(u, ys.pitchR)), queue, rack.id, y.id);
    const fR = frac((off - rs.x0) / pitch);
    setPhase(y, beta - frac(fR + 0.5) * tau(y), rack.id);
  };

  const visit = (node: Node, queue: Node[]) => {
    if (node.kind === 'shaft') {
      for (const g of gearsOnShaft.get(node.id)!) {
        for (const i of meshesOf.get(g.id) ?? []) fromGear(g, i, queue);
      }
    } else {
      const rack = rackById.get(node.id)!;
      for (const i of meshesOf.get(rack.id) ?? []) {
        const pinion = gearById.get(p.meshes[i].a)!;
        if (!placedShafts.has(pinion.shaftId)) fromRack(rack, i, queue);
      }
    }
  };

  const extentMaxX = (): number => {
    let maxX = -Infinity;
    for (const id of placedShafts) {
      const s = shaftSol.get(id)!;
      const r = Math.max(0, ...gearsOnShaft.get(id)!.map((g) => gearSol.get(g.id)!.outerR));
      maxX = Math.max(maxX, s.x + r);
    }
    for (const id of placedRacks) {
      const r = rackSol.get(id)!;
      const t = rackT(r);
      maxX = Math.max(maxX, r.origin.x + Math.abs(t.x) * (r.length / 2));
    }
    return maxX;
  };

  const gap = 10 * m;
  let firstRoot: string | undefined;
  for (const root of p.shafts) {
    if (placedShafts.has(root.id)) continue;
    const before = new Set([...placedShafts, ...placedRacks]);
    const rootR = Math.max(0, ...gearsOnShaft.get(root.id)!.map((g) => gearSol.get(g.id)!.outerR));
    placeShaft(root.id, firstRoot === undefined ? { x: 0, y: 0 } : { x: extentMaxX() + gap + rootR, y: 0 });
    const queue: Node[] = [{ kind: 'shaft', id: root.id }];
    while (queue.length) visit(queue.shift()!, queue);
    if (firstRoot === undefined) firstRoot = root.id;
    else {
      const component = [...placedShafts, ...placedRacks].filter((id) => !before.has(id));
      warn(`${component.join(', ')}: not connected to ${firstRoot}; placed beside the main train`, ...component);
    }
  }
  for (const r of racks) {
    if (placedRacks.has(r.id)) continue;
    const x = (placedShafts.size || placedRacks.size ? extentMaxX() + gap : 0) + r.length / 2;
    r.origin = { x, y: 0 };
    placedRacks.add(r.id);
    if (firstRoot !== undefined) warn(`${r.id}: not connected to ${firstRoot}; placed beside the main train`, r.id);
  }
  for (const g of gears) {
    const s = shaftSol.get(g.shaftId)!;
    g.x = s.x;
    g.y = s.y;
  }

  // ---- speeds -----------------------------------------------------------
  const omega = new Map<string, number>(); // shafts: rpm (kept in rpm so pure gear chains stay exact)
  const vel = new Map<string, number>(); // racks: mm/s
  const speedConflict = (id: string, have: number, want: number, ...refs: string[]) => {
    if (Math.abs(have - want) > 1e-9 * Math.max(1, Math.abs(have), Math.abs(want))) {
      err(`speed conflict at ${id}: the train would bind (two paths give different speeds)`, id, ...refs);
    }
  };
  const queue: Node[] = [];
  if (input.kind === 'shaft') {
    omega.set(input.shaftId, input.rpm);
    queue.push({ kind: 'shaft', id: input.shaftId });
  } else {
    vel.set(input.rackId, input.mmPerSec);
    queue.push({ kind: 'rack', id: input.rackId });
  }
  while (queue.length) {
    const node = queue.shift()!;
    if (node.kind === 'shaft') {
      const w = omega.get(node.id)!;
      for (const x of gearsOnShaft.get(node.id)!) {
        for (const i of meshesOf.get(x.id) ?? []) {
          const mesh = p.meshes[i];
          const otherId = mesh.a === x.id ? mesh.b : mesh.a;
          const y = gearById.get(otherId);
          if (y) {
            const wy = (-w * x.teeth) / y.teeth;
            if (omega.has(y.shaftId)) speedConflict(y.shaftId, omega.get(y.shaftId)!, wy, x.id, y.id);
            else {
              omega.set(y.shaftId, wy);
              queue.push({ kind: 'shaft', id: y.shaftId });
            }
          } else {
            const v = ((w * TAU) / 60) * gearSol.get(x.id)!.pitchR;
            if (vel.has(otherId)) speedConflict(otherId, vel.get(otherId)!, v, x.id);
            else {
              vel.set(otherId, v);
              queue.push({ kind: 'rack', id: otherId });
            }
          }
        }
      }
    } else {
      const v = vel.get(node.id)!;
      for (const i of meshesOf.get(node.id) ?? []) {
        const y = gearById.get(p.meshes[i].a)!;
        const wy = ((v / gearSol.get(y.id)!.pitchR) * 60) / TAU;
        if (omega.has(y.shaftId)) speedConflict(y.shaftId, omega.get(y.shaftId)!, wy, node.id, y.id);
        else {
          omega.set(y.shaftId, wy);
          queue.push({ kind: 'shaft', id: y.shaftId });
        }
      }
    }
  }
  const rpmIn = input.kind === 'shaft' ? input.rpm : undefined;
  for (const s of shafts) {
    const w = omega.get(s.id);
    if (w === undefined) continue;
    s.rpm = w;
    s.dir = s.rpm > 1e-12 ? 'ccw' : s.rpm < -1e-12 ? 'cw' : 'stopped';
    if (rpmIn !== undefined && rpmIn !== 0 && s.rpm !== 0) s.torqueRatio = Math.abs(rpmIn / s.rpm);
  }
  for (const g of gears) {
    const w = omega.get(g.shaftId);
    if (w === undefined) continue;
    g.rpm = w;
    g.surfaceSpeed = ((Math.abs(w) * TAU) / 60) * g.pitchR;
  }
  for (const r of racks) {
    const v = vel.get(r.id);
    if (v !== undefined) r.mmPerSec = v;
  }
  const undriven = [...shafts.filter((s) => s.rpm === undefined).map((s) => s.id), ...racks.filter((r) => r.mmPerSec === undefined).map((r) => r.id)];
  if (undriven.length) warn(`${undriven.join(', ')}: not driven by the input`, ...undriven);

  // ---- design warnings --------------------------------------------------
  const limit = undercutLimit(pa);
  for (const g of p.gears) {
    const gs = gearSol.get(g.id)!;
    if (g.teeth < limit) warn(`${g.id}: ${g.teeth} teeth is below ${limit}; undercut likely at ${p.pressureAngleDeg}°`, g.id);
    if (toothTipHalfAngle(tp(g.teeth)) <= 0) warn(`${g.id}: teeth are pointed (they narrow to a point below the tip circle)`, g.id);
    const bore = shaftById.get(g.shaftId)!.bore;
    if (gs.rootR - boreRadius(bore) < m) warn(`${g.id}: bore leaves less than one module of material below the teeth`, g.id, g.shaftId);
  }
  const meshed = new Set(p.meshes.map((x) => [x.a, x.b].sort().join('|')));
  const zOverlap = (a: Gear, b: Gear) => Math.min(a.zOffset + a.faceWidth, b.zOffset + b.faceWidth) - Math.max(a.zOffset, b.zOffset);
  p.meshes.forEach((mesh, i) => {
    const ms = meshes[i];
    if (ms.contactRatio < 1.2) warn(`mesh ${mesh.a}–${mesh.b}: contact ratio ${ms.contactRatio.toFixed(2)} is below 1.2 (rough running)`, mesh.a, mesh.b);
    const b = gearById.get(mesh.b);
    if (b) {
      if (zOverlap(gearById.get(mesh.a)!, b) <= 0) warn(`mesh ${mesh.a}–${mesh.b}: faces do not overlap in z`, mesh.a, mesh.b);
    } else {
      const rs = rackSol.get(mesh.b)!;
      if (ms.contactX !== undefined && Math.abs(ms.contactX) > rs.length / 2 - pitch / 2) {
        warn(`mesh ${mesh.a}–${mesh.b}: contact point is beyond the end of rack ${mesh.b}`, mesh.b, mesh.a);
      }
    }
  });
  for (let i = 0; i < p.gears.length; i++) {
    for (let j = i + 1; j < p.gears.length; j++) {
      const a = p.gears[i];
      const b = p.gears[j];
      if (a.shaftId === b.shaftId || meshed.has([a.id, b.id].sort().join('|'))) continue;
      const as = gearSol.get(a.id)!;
      const bs = gearSol.get(b.id)!;
      if (zOverlap(a, b) > 0 && dist(as, bs) < as.outerR + bs.outerR - 1e-9) warn(`${a.id} and ${b.id} overlap`, a.id, b.id);
    }
  }
  for (const g of p.gears) {
    const gs = gearSol.get(g.id)!;
    for (const s of p.shafts) {
      if (s.id === g.shaftId) continue;
      if (dist(gs, shaftSol.get(s.id)!) < gs.outerR + boreRadius(s.bore)) warn(`${g.id} passes over shaft ${s.id}`, g.id, s.id);
    }
  }

  return { ok: !issues.some((i) => i.severity === 'error'), module: m, pa, shafts, gears, racks, meshes, issues };
}

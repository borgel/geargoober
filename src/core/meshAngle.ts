// Default angle for a gear–gear mesh: put the new mate somewhere it doesn't land on top of other parts.
import { boreRadius, type Project } from './model';
import { solve } from './solver';
import { DEG } from './units';

interface Circle {
  x: number;
  y: number;
  r: number;
  /** Gear id, so the meshing pair itself isn't counted as an overlap. */
  id?: string;
}

const STEP_DEG = 5;
const norm = (deg: number) => ((Math.round(deg) % 360) + 360) % 360;

/**
 * Suggested angle (degrees, [0, 360)) for mesh `i`, or undefined when the mesh involves a rack
 * (the rack fixes the angle) or isn't complete.
 *
 * Without mesh `i` the train splits into the part holding `a` (fixed) and the part holding `b`
 * (moved as one rigid group, since every mesh angle is absolute). Candidate angles start at the
 * direction pointing away from the rest of the train and fan out in 5° steps; the first that keeps
 * every part a module clear wins, otherwise the one with the most room. When `a` and `b` are already
 * connected another way, the current direction between them is returned.
 */
export function suggestMeshAngle(p: Project, i: number): number | undefined {
  const mesh = p.meshes[i];
  const ga = p.gears.find((g) => g.id === mesh?.a);
  const gb = p.gears.find((g) => g.id === mesh?.b);
  if (!ga || !gb || ga.shaftId === gb.shaftId) return undefined;

  const without: Project = { ...p, meshes: p.meshes.filter((_, j) => j !== i) };
  const s = solve(without);
  if (!s.laidOut) return undefined;

  // Connected groups of shafts and racks, linked by the remaining meshes.
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    while (parent.has(x) && parent.get(x) !== x) x = parent.get(x)!;
    return x;
  };
  const node = (id: string) => p.gears.find((g) => g.id === id)?.shaftId ?? id;
  for (const m of without.meshes) {
    const [x, y] = [find(node(m.a)), find(node(m.b))];
    if (x !== y) parent.set(x, y);
  }
  const fixedRoot = find(ga.shaftId);
  const movingRoot = find(gb.shaftId);
  const sa = s.gears.find((g) => g.id === ga.id)!;
  const sb = s.gears.find((g) => g.id === gb.id)!;
  if (fixedRoot === movingRoot) return norm(Math.atan2(sb.y - sa.y, sb.x - sa.x) / DEG);

  const m = s.module;
  const shapes = (root: string): Circle[] => {
    const out: Circle[] = [];
    for (const g of s.gears) if (find(g.shaftId) === root) out.push({ x: g.x, y: g.y, r: g.outerR, id: g.id });
    for (const sh of s.shafts) {
      const bore = p.shafts.find((x) => x.id === sh.id)?.bore;
      if (find(sh.id) === root) out.push({ x: sh.x, y: sh.y, r: bore ? boreRadius(bore) : 0 });
    }
    for (const r of s.racks) {
      if (find(r.id) !== root) continue;
      // a rack as a row of circles along its pitch line, as deep as its teeth plus back
      const back = p.racks.find((x) => x.id === r.id)?.backHeight ?? 0;
      const ux = Math.cos(r.angle);
      const uy = Math.sin(r.angle);
      for (let t = -r.length / 2; t <= r.length / 2; t += m) out.push({ x: r.origin.x + ux * t, y: r.origin.y + uy * t, r: 1.25 * m + back });
    }
    return out;
  };
  const fixed = shapes(fixedRoot);
  const moving = shapes(movingRoot);
  const centroid = (root: string, skip: string) => {
    const pts = s.shafts.filter((sh) => find(sh.id) === root && sh.id !== skip);
    if (!pts.length) return undefined;
    return { x: pts.reduce((t, q) => t + q.x, 0) / pts.length, y: pts.reduce((t, q) => t + q.y, 0) / pts.length };
  };

  // Prefer growing away from the fixed group; failing that, let the moved group trail away from it.
  const cf = centroid(fixedRoot, ga.shaftId);
  const cm = centroid(movingRoot, gb.shaftId);
  let pref = mesh.angleDeg;
  if (cf && Math.hypot(sa.x - cf.x, sa.y - cf.y) > 1e-9) pref = Math.atan2(sa.y - cf.y, sa.x - cf.x) / DEG;
  else if (cm && Math.hypot(sb.x - cm.x, sb.y - cm.y) > 1e-9) pref = Math.atan2(sb.y - cm.y, sb.x - cm.x) / DEG;
  pref = Math.round((Number.isFinite(pref) ? pref : 0) / STEP_DEG) * STEP_DEG;

  const cd = sa.pitchR + sb.pitchR;
  const room = (deg: number) => {
    const dx = sa.x + cd * Math.cos(deg * DEG) - sb.x;
    const dy = sa.y + cd * Math.sin(deg * DEG) - sb.y;
    let worst = Infinity;
    for (const q of moving) {
      for (const f of fixed) {
        if (q.id === gb.id && f.id === ga.id) continue;
        worst = Math.min(worst, Math.hypot(q.x + dx - f.x, q.y + dy - f.y) - q.r - f.r);
      }
    }
    return worst;
  };

  let best = pref;
  let bestRoom = -Infinity;
  for (let k = 0; k <= 180 / STEP_DEG; k++) {
    for (const deg of k === 0 ? [pref] : [pref + k * STEP_DEG, pref - k * STEP_DEG]) {
      const r = room(deg);
      if (r >= m) return norm(deg);
      if (r > bestRoom) [best, bestRoom] = [deg, r];
    }
  }
  return norm(best);
}

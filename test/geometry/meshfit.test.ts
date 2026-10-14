import { describe, expect, it } from 'vitest';
import { partProfile } from '../../src/core/geometry/parts';
import { pointInPolygon, sampleLoop, transformLoop } from '../../src/core/geometry/sample';
import type { Loop } from '../../src/core/geometry/types';
import type { Project } from '../../src/core/model';
import { solve, type Solution } from '../../src/core/solver';
import { dist, rot, type Vec2 } from '../../src/core/vec';
import { project } from '../helpers/project';

const B = 0.1;

function outerOf(p: Project, s: Solution, id: string): Loop {
  const r = partProfile(p, s, id, { kerf: false });
  if (!r.ok) throw new Error(r.error);
  return r.profile.outer;
}

function overlaps(a: Vec2[], b: Vec2[], near: Vec2, radius: number): boolean {
  const an = a.filter((q) => dist(q, near) < radius);
  const bn = b.filter((q) => dist(q, near) < radius);
  return bn.some((q) => pointInPolygon(q, a)) || an.some((q) => pointInPolygon(q, b));
}

function firstContact(free: (d: number) => boolean, hi: number): number {
  let lo = 0;
  expect(free(lo)).toBe(true);
  expect(free(hi)).toBe(false);
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (free(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

describe('mesh fit at solved positions and phases', () => {
  for (const [za, zb, angle] of [
    [12, 31, 0],
    [17, 17, 133],
    [40, 9, 250],
  ]) {
    it(`gears z${za}/z${zb} at ${angle}° mesh without overlap and with the set backlash`, () => {
      const p = project(`
input S1 rpm 10
shaft S1 bore round 3
shaft S2 bore round 3
gear GA on S1 teeth ${za} width 5
gear GB on S2 teeth ${zb} width 5
mesh GA GB angle ${angle}
`);
      const s = solve(p);
      const sa = s.shafts[0];
      const sb = s.shafts[1];
      const rA = za / 2;
      const rB = zb / 2;
      const near = { x: sa.x + (sb.x - sa.x) * (rA / (rA + rB)), y: sa.y + (sb.y - sa.y) * (rA / (rA + rB)) };
      const polyA = (dA: number) => sampleLoop(transformLoop(outerOf(p, s, 'GA'), dA, 0, 0), 0.0005).map((q) => ({ x: q.x + sa.x, y: q.y + sa.y }));
      const polyB = (dB: number) => sampleLoop(transformLoop(outerOf(p, s, 'GB'), dB, 0, 0), 0.0005).map((q) => ({ x: q.x + sb.x, y: q.y + sb.y }));
      const A0 = polyA(0);
      expect(overlaps(A0, polyB(0), near, 3)).toBe(false);

      const quarter = (2 * Math.PI) / zb / 4;
      const plus = firstContact((d) => !overlaps(A0, polyB(d), near, 3), quarter);
      const minus = firstContact((d) => !overlaps(A0, polyB(-d), near, 3), quarter);
      const play = (plus + minus) * rB;
      expect(play).toBeGreaterThan(0.85 * B);
      expect(play).toBeLessThan(1.15 * B);

      // still clear after turning both gears kinematically by 0.3 tooth
      const dA = 0.3 * ((2 * Math.PI) / za);
      expect(overlaps(polyA(dA), polyB((-dA * za) / zb), near, 3)).toBe(false);
    });
  }

  it('pinion and rack mesh without overlap and with the set backlash', () => {
    const p = project(`
input S1 rpm 10
shaft S1 bore round 3
gear G on S1 teeth 15 width 5
rack R teeth 20 width 5
mesh G R angle 250
`);
    const s = solve(p);
    const r = s.racks[0];
    const t = rot({ x: 1, y: 0 }, r.angle);
    const g = s.shafts[0];
    const near = { x: g.x + Math.cos((250 * Math.PI) / 180) * 7.5, y: g.y + Math.sin((250 * Math.PI) / 180) * 7.5 };
    const gearPoly = sampleLoop(outerOf(p, s, 'G'), 0.0005).map((q) => ({ x: q.x + g.x, y: q.y + g.y }));
    const rackPoly = (d: number) =>
      sampleLoop(transformLoop(outerOf(p, s, 'R'), r.angle, r.origin.x + t.x * d, r.origin.y + t.y * d), 0.0005);
    expect(overlaps(gearPoly, rackPoly(0), near, 3)).toBe(false);
    const plus = firstContact((d) => !overlaps(gearPoly, rackPoly(d), near, 3), Math.PI / 4);
    const minus = firstContact((d) => !overlaps(gearPoly, rackPoly(-d), near, 3), Math.PI / 4);
    expect(plus + minus).toBeGreaterThan(0.85 * B);
    expect(plus + minus).toBeLessThan(1.15 * B);
  });

  it('builds part profiles with the shaft bore', () => {
    const p = project('input S1 rpm 1\nshaft S1 bore hex 6.35\ngear G on S1 teeth 30 width 5\n');
    const r = partProfile(p, solve(p), 'G', { kerf: false });
    expect(r.ok && r.profile.holes.length).toBe(1);
    const missing = partProfile(p, solve(p), 'nope', { kerf: false });
    expect(missing.ok).toBe(false);
  });
});

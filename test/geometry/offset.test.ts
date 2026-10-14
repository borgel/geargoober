import { describe, expect, it } from 'vitest';
import { offsetLoop } from '../../src/core/geometry/offset';
import { partProfile } from '../../src/core/geometry/parts';
import { loopArea, profileArea, sampleLoop } from '../../src/core/geometry/sample';
import { spurOuterLoop } from '../../src/core/geometry/spur';
import type { Loop } from '../../src/core/geometry/types';
import { solve } from '../../src/core/solver';
import { dist, v, type Vec2 } from '../../src/core/vec';
import { expectClosed } from '../helpers/geom';
import { project } from '../helpers/project';

const DEG = Math.PI / 180;
const square = (s: number): Loop => [
  { kind: 'line', a: v(0, 0), b: v(s, 0) },
  { kind: 'line', a: v(s, 0), b: v(s, s) },
  { kind: 'line', a: v(s, s), b: v(0, s) },
  { kind: 'line', a: v(0, s), b: v(0, 0) },
];

function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const l2 = abx * abx + aby * aby;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / l2));
  return dist(p, { x: a.x + abx * t, y: a.y + aby * t });
}

function ok(loop: Loop, d: number): Loop {
  const r = offsetLoop(loop, d);
  if (!r.ok) throw new Error(r.error);
  return r.loop;
}

describe('offsetLoop', () => {
  it('offsets a square outward with round corners', () => {
    const out = ok(square(10), 1);
    expectClosed(out);
    expect(loopArea(out)).toBeCloseTo(140 + Math.PI, 9);
  });

  it('grows a circle radius', () => {
    const circle: Loop = [
      { kind: 'arc', center: v(0, 0), r: 4, start: 0, end: Math.PI },
      { kind: 'arc', center: v(0, 0), r: 4, start: Math.PI, end: 2 * Math.PI },
    ];
    const out = ok(circle, 0.5);
    expect(out).toHaveLength(2);
    expect(loopArea(out)).toBeCloseTo(Math.PI * 4.5 ** 2, 9);
  });

  it('offsets a spur gear outline by a uniform distance', () => {
    const loop = spurOuterLoop({ m: 1, z: 20, paRad: 20 * DEG, backlash: 0.1, clearanceCoef: 0.25 }).loop;
    const d = 0.075;
    const out = ok(loop, d);
    expectClosed(out, 1e-7);
    const orig = sampleLoop(loop, 0.0002);
    let perimeter = 0;
    for (let i = 0; i < orig.length; i++) perimeter += dist(orig[i], orig[(i + 1) % orig.length]);
    const grow = loopArea(out) - loopArea(loop);
    expect(grow).toBeGreaterThan(perimeter * d * 0.95);
    expect(grow).toBeLessThan(perimeter * d * 1.05);
    const pts = sampleLoop(out, 0.001);
    for (let i = 0; i < pts.length; i += 7) {
      let best = Infinity;
      for (let j = 0; j < orig.length; j++) best = Math.min(best, distToSegment(pts[i], orig[j], orig[(j + 1) % orig.length]));
      expect(Math.abs(best - d)).toBeLessThan(0.003);
    }
  });

  it('rejects kerf larger than concave radius', () => {
    const loop = spurOuterLoop({ m: 0.3, z: 20, paRad: 20 * DEG, backlash: 0.02, clearanceCoef: 0.25 }).loop;
    const r = offsetLoop(loop, 0.15);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/kerf/i);
  });
});

describe('partProfile with kerf', () => {
  it('grows the outline and shrinks the bore', () => {
    const p = project('fit kerf 0.2\ninput S1 rpm 1\nshaft S1 bore round 5\ngear G on S1 teeth 20 width 5\n');
    const s = solve(p);
    const nominal = partProfile(p, s, 'G', { kerf: false });
    const cut = partProfile(p, s, 'G', { kerf: true });
    if (!nominal.ok || !cut.ok) throw new Error('profile');
    expect(loopArea(cut.profile.outer)).toBeGreaterThan(loopArea(nominal.profile.outer));
    expect(-loopArea(cut.profile.holes[0])).toBeCloseTo(Math.PI * 2.4 ** 2, 9);
    expect(profileArea(cut.profile)).toBeGreaterThan(profileArea(nominal.profile));
  });

  it('reports kerf that the profile cannot absorb', () => {
    const p = project('pitch module 0.3\nfit kerf 0.4 backlash 0.02\ninput S1 rpm 1\nshaft S1 bore round 1\ngear G on S1 teeth 20 width 5\n');
    const r = partProfile(p, solve(p), 'G', { kerf: true });
    expect(r.ok).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { stepPerTick } from '../../src/core/escapement';
import { specHtml } from '../../src/core/export/spec';
import { parseGear, serializeGear } from '../../src/core/format/gearText';
import { fromJson, toJson } from '../../src/core/format/json';
import { solve } from '../../src/core/solver';

const CLOCK = `project "Clock"
input S1 rpm 1 ticks 1
shaft S1 bore round 3
shaft S2 bore round 3
gear G1 on S1 teeth 60 width 4
gear G2 on S2 teeth 20 width 4
mesh G1 G2 angle 0
`;

const parsed = (text: string) => {
  const r = parseGear(text);
  if (!r.ok) throw new Error(r.errors.map((e) => e.message).join('; '));
  return r.project;
};

describe('escapement ticks', () => {
  it('parses and round-trips ticks on a shaft input', () => {
    const p = parsed(CLOCK);
    expect(p.input).toEqual({ kind: 'shaft', shaftId: 'S1', rpm: 1, ticksPerSec: 1 });
    expect(serializeGear(p)).toContain('input S1 rpm 1 ticks 1');
    expect(parsed(serializeGear(p)).input).toEqual(p.input);
  });

  it('parses ticks on a rack input', () => {
    const p = parsed(`input R1 mmps 5 ticks 2.5\nrack R1 teeth 20 width 4\n`);
    expect(p.input).toEqual({ kind: 'rack', rackId: 'R1', mmPerSec: 5, ticksPerSec: 2.5 });
  });

  it('leaves smooth inputs without a ticks key', () => {
    const p = parsed(CLOCK.replace(' ticks 1', ''));
    expect('ticksPerSec' in p.input).toBe(false);
    expect(serializeGear(p)).not.toContain('ticks');
  });

  it('round-trips ticks through JSON and rejects a non-numeric value', () => {
    const p = parsed(CLOCK);
    const back = fromJson(toJson(p, solve(p)));
    expect(back.ok && back.project.input).toEqual(p.input);
    const bad = JSON.parse(toJson(p, solve(p)));
    bad.project.input.ticksPerSec = 'fast';
    expect(fromJson(JSON.stringify(bad)).ok).toBe(false);
  });

  it('steps each part by its share of one tick', () => {
    const s = solve(parsed(CLOCK));
    // 1 rpm, 1 tick/s: input moves 6° per tick; the 20T gear turns 3× as fast, the other way.
    expect(stepPerTick(1, 1)).toBeCloseTo(6, 12);
    expect(stepPerTick(s.shafts.find((x) => x.id === 'S2')!.rpm!, 1)).toBeCloseTo(-18, 9);
    expect(stepPerTick(10, undefined)).toBeUndefined();
  });

  it('errors on a zero or negative tick rate', () => {
    for (const t of [0, -2]) {
      const p = parsed(CLOCK);
      p.input.ticksPerSec = t;
      expect(solve(p).issues.some((i) => i.severity === 'error' && /ticks/.test(i.message))).toBe(true);
    }
  });

  it('warns when ticks are faster than the screen can show', () => {
    const p = parsed(CLOCK.replace('ticks 1', 'ticks 120'));
    const s = solve(p);
    expect(s.issues.some((i) => i.severity === 'warning' && /ticks/.test(i.message))).toBe(true);
    expect(s.issues.some((i) => i.severity === 'error')).toBe(false);
  });

  it('lists the tick rate and steps on the spec sheet', () => {
    const p = parsed(CLOCK);
    const html = specHtml(p, solve(p), 'test');
    expect(html).toContain('1 ticks/s');
    expect(html).toMatch(/step\/tick/i);
    expect(html).toContain('-18°');
  });
});

import { describe, expect, it } from 'vitest';
import { fromJson, toJson } from '../../src/core/format/json';
import { parseGear } from '../../src/core/format/gearText';

describe('json io', () => {
  it('round-trips a project', () => {
    const r = parseGear('project "J"\nshaft S1 bore hex 6.35\ngear G1 on S1 teeth 20 width 4\ninput S1 rpm 10\n');
    if (!r.ok) throw new Error('parse');
    const back = fromJson(toJson(r.project));
    expect(back).toEqual({ ok: true, project: r.project });
  });

  it('accepts a bundle with a solution field', () => {
    const r = parseGear('shaft S1 bore round 5\n');
    if (!r.ok) throw new Error('parse');
    const text = toJson(r.project, { anything: 1 });
    expect(JSON.parse(text).solution).toEqual({ anything: 1 });
    expect(fromJson(text).ok).toBe(true);
  });

  it('reports invalid json', () => {
    const r = fromJson('{nope');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0].line).toBe(1);
  });

  it('reports json that is not a project', () => {
    expect(fromJson('{"foo": 1}').ok).toBe(false);
  });
});

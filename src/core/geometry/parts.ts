// Turns a solved project part (gear or rack) into its exact 2D profile in part-local coordinates.
import type { Project } from '../model';
import type { Solution } from '../solver';
import { boreLoop } from './bore';
import { offsetLoop } from './offset';
import { rackOuterLoop } from './rack';
import { transformLoop } from './sample';
import { spurOuterLoop } from './spur';
import type { Profile } from './types';

export interface PartOptions {
  /** Apply the project's kerf compensation. */
  kerf: boolean;
  /** Draw tooth 0 on +x instead of at the solved mesh phase. */
  zeroPhase?: boolean;
}

export type PartResult = { ok: true; kind: 'gear' | 'rack'; profile: Profile } | { ok: false; error: string };

export function partProfile(p: Project, s: Solution, id: string, opts: PartOptions): PartResult {
  const fit = p.fit;
  const gear = p.gears.find((g) => g.id === id);
  if (gear) {
    const gs = s.gears.find((g) => g.id === id)!;
    const shaft = p.shafts.find((x) => x.id === gear.shaftId);
    if (!shaft) return { ok: false, error: `${id}: unknown shaft ${gear.shaftId}` };
    const { loop } = spurOuterLoop({ m: s.module, z: gear.teeth, paRad: s.pa, backlash: fit.backlashMm, clearanceCoef: fit.clearanceCoef });
    const half = opts.kerf ? fit.kerfMm / 2 : 0;
    const off = offsetLoop(opts.zeroPhase ? loop : transformLoop(loop, gs.phase, 0, 0), half);
    if (!off.ok) return { ok: false, error: `${id}: ${off.error}` };
    const hole = boreLoop(shaft.bore, { relief: fit.cornerReliefMm, shrink: half });
    return { ok: true, kind: 'gear', profile: { outer: off.loop, holes: [hole] } };
  }
  const rack = p.racks.find((r) => r.id === id);
  if (rack) {
    const nominal = rackOuterLoop({
      m: s.module,
      n: rack.teeth,
      paRad: s.pa,
      backlash: fit.backlashMm,
      clearanceCoef: fit.clearanceCoef,
      backHeight: rack.backHeight,
    });
    const off = offsetLoop(nominal, opts.kerf ? fit.kerfMm / 2 : 0);
    if (!off.ok) return { ok: false, error: `${id}: ${off.error}` };
    return { ok: true, kind: 'rack', profile: { outer: off.loop, holes: [] } };
  }
  return { ok: false, error: `unknown part "${id}"` };
}

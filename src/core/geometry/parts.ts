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

const mm = (x: number) => `${Number(x.toFixed(3))} mm`;

/** Explains a failed kerf offset in terms the user can act on. */
function kerfError(id: string, kerf: number, off: { error: string; radius?: number }): string {
  if (off.radius === undefined) return `${id}: kerf ${mm(kerf)}: ${off.error}`;
  return `${id}: kerf ${mm(kerf)} needs every inside curve to have a radius of at least ${mm(kerf / 2)}, but this part's root fillet is ${mm(off.radius)}; the largest kerf that fits is ${mm(2 * off.radius)}`;
}

export function partProfile(p: Project, s: Solution, id: string, opts: PartOptions): PartResult {
  const fit = p.fit;
  const gear = p.gears.find((g) => g.id === id);
  if (gear) {
    const gs = s.gears.find((g) => g.id === id)!;
    const shaft = p.shafts.find((x) => x.id === gear.shaftId);
    if (!shaft) return { ok: false, error: `${id}: unknown shaft ${gear.shaftId}` };
    const { loop } = spurOuterLoop({ m: s.module, z: gear.teeth, paRad: s.pa, backlash: fit.backlashMm, clearanceCoef: fit.clearanceCoef });
    const half = opts.kerf ? fit.kerfMm / 2 : 0;
    const b = shaft.bore;
    const left =
      b.kind === 'round' ? b.dia / 2 - half : b.kind === 'dflat' ? b.dia / 2 - half - b.flatDepth / 2 : b.kind === 'hex' ? b.acrossFlats / 2 - half : b.side / 2 - half;
    if (!(left > 0)) return { ok: false, error: `${id}: kerf ${fit.kerfMm} mm would close up the ${gear.shaftId} bore` };
    const off = offsetLoop(opts.zeroPhase ? loop : transformLoop(loop, gs.phase, 0, 0), half);
    if (!off.ok) return { ok: false, error: kerfError(id, fit.kerfMm, off) };
    const hole = boreLoop(b, { relief: fit.cornerReliefMm, shrink: half, style: fit.reliefStyle });
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
    if (!off.ok) return { ok: false, error: kerfError(id, fit.kerfMm, off) };
    return { ok: true, kind: 'rack', profile: { outer: off.loop, holes: [] } };
  }
  return { ok: false, error: `unknown part "${id}"` };
}

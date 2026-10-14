import { parseGear } from '../../src/core/format/gearText';
import type { Project } from '../../src/core/model';
import { solve, type Solution } from '../../src/core/solver';

export function project(text: string): Project {
  const r = parseGear(text);
  if (!r.ok) throw new Error('parse failed: ' + JSON.stringify(r.errors));
  return r.project;
}

export function solveText(text: string): Solution {
  return solve(project(text));
}

export const frac = (x: number) => x - Math.floor(x);

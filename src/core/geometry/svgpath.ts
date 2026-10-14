// Exact SVG path data for a profile, in math coordinates (+y up). Draw inside a scale(1,-1) group.
import { segStart, segEnd } from './sample';
import type { Loop, Profile } from './types';

const f = (x: number) => {
  const s = x.toFixed(4).replace(/\.?0+$/, '');
  return s === '-0' ? '0' : s;
};

export function loopToPath(loop: Loop): string {
  if (!loop.length) return '';
  const start = segStart(loop[0]);
  let d = `M${f(start.x)} ${f(start.y)}`;
  for (const s of loop) {
    const e = segEnd(s);
    if (s.kind === 'line') d += `L${f(e.x)} ${f(e.y)}`;
    else if (s.kind === 'arc') {
      const sweep = s.end - s.start;
      d += `A${f(s.r)} ${f(s.r)} 0 ${Math.abs(sweep) > Math.PI ? 1 : 0} ${sweep > 0 ? 1 : 0} ${f(e.x)} ${f(e.y)}`;
    } else d += `C${f(s.p[1].x)} ${f(s.p[1].y)} ${f(s.p[2].x)} ${f(s.p[2].y)} ${f(e.x)} ${f(e.y)}`;
  }
  return d + 'Z';
}

export function profileToPath(p: Profile): string {
  return [p.outer, ...p.holes].map(loopToPath).join('');
}

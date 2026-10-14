import type { Project } from './model';

export const DEG = Math.PI / 180;

/** Module in mm, regardless of how the pitch was entered. NaN when invalid. */
export function moduleOf(p: Project): number {
  const { system, value } = p.pitch;
  if (system === 'module') return value;
  return value > 0 ? 25.4 / value : NaN;
}

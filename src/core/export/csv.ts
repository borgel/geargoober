import type { Project } from '../model';
import type { Solution } from '../solver';

const cell = (v: string | number | undefined): string => {
  if (v === undefined) return '';
  // text that a spreadsheet would run as a formula gets a leading apostrophe; numbers stay as-is
  const s = typeof v === 'number' ? String(Number(v.toFixed(6))) : /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function gearsCsv(p: Project, s: Solution): string {
  const rows = [['id', 'name', 'shaft', 'teeth', 'module', 'pitch_dia', 'outer_dia', 'root_dia', 'face_width', 'z_offset', 'x', 'y', 'rpm', 'phase_deg'].join(',')];
  for (const g of p.gears) {
    const gs = s.gears.find((x) => x.id === g.id)!;
    rows.push(
      [g.id, g.name, g.shaftId, g.teeth, s.module, gs.pitchR * 2, gs.outerR * 2, gs.rootR * 2, g.faceWidth, g.zOffset, gs.x, gs.y, gs.rpm, (gs.phase * 180) / Math.PI]
        .map(cell)
        .join(','),
    );
  }
  return rows.join('\n') + '\n';
}

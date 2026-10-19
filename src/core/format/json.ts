import { DEFAULT_EXPORT_PREFS, DEFAULT_FIT, newProject, type Project } from '../model';
import type { ParseResult } from './gearText';

export function toJson(project: Project, solution?: unknown): string {
  return JSON.stringify({ format: 'geargoober', version: 1, project, solution }, null, 2);
}

export function fromJson(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [{ line: 1, col: 1, message: `invalid JSON: ${(e as Error).message}` }] };
  }
  const raw = (data as { project?: unknown })?.project ?? data;
  const p = raw as Partial<Project>;
  const valid =
    p &&
    typeof p === 'object' &&
    Array.isArray(p.shafts) &&
    Array.isArray(p.gears) &&
    Array.isArray(p.racks) &&
    Array.isArray(p.meshes) &&
    typeof p.pitch === 'object';
  if (!valid) return { ok: false, errors: [{ line: 1, col: 1, message: 'JSON does not contain a GearGoober project' }] };
  const problem = shapeProblem(p as Project);
  if (problem) return { ok: false, errors: [{ line: 1, col: 1, message: `invalid project JSON: ${problem}` }] };
  const base = newProject();
  for (const x of [...p.shafts!, ...p.gears!, ...p.racks!]) if (!isStr(x.name)) x.name = x.id;
  for (const g of p.gears!) if (!isNum(g.zOffset)) g.zOffset = 0;
  return {
    ok: true,
    project: {
      ...base,
      ...p,
      fit: { ...DEFAULT_FIT, ...p.fit },
      exportPrefs: { ...DEFAULT_EXPORT_PREFS, ...p.exportPrefs },
    } as Project,
  };
}

const isNum = (x: unknown) => typeof x === 'number';
const isStr = (x: unknown) => typeof x === 'string';

/** Structural check so a hand-edited or foreign JSON file can't crash the solver later. */
function shapeProblem(p: Project): string | undefined {
  if (!isStr(p.pitch.system) || !isNum(p.pitch.value)) return 'pitch must have a system and a numeric value';
  for (const s of p.shafts) {
    if (!isStr(s?.id) || typeof s.bore !== 'object' || s.bore === null || !isStr(s.bore.kind)) return `shaft ${s?.id ?? '?'} needs an id and a bore`;
  }
  for (const g of p.gears) {
    if (!isStr(g?.id) || !isStr(g.shaftId) || !isNum(g.teeth) || !isNum(g.faceWidth)) return `gear ${g?.id ?? '?'} needs id, shaftId, teeth and faceWidth`;
  }
  for (const r of p.racks) {
    if (!isStr(r?.id) || !isNum(r.teeth) || !isNum(r.faceWidth) || !isNum(r.backHeight)) return `rack ${r?.id ?? '?'} needs id, teeth, faceWidth and backHeight`;
  }
  for (const m of p.meshes) {
    if (!isStr(m?.a) || !isStr(m.b) || !isNum(m.angleDeg)) return 'each mesh needs a, b and angleDeg';
  }
  const i = p.input as unknown as Record<string, unknown> | undefined;
  if (i && !(i.kind === 'shaft' || i.kind === 'rack')) return 'input kind must be shaft or rack';
  if (i && i.ticksPerSec !== undefined && !isNum(i.ticksPerSec)) return 'input ticksPerSec must be a number';
  return undefined;
}

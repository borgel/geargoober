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
  const base = newProject();
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

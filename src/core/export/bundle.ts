// Assembles every export file for a project; the single entry point the UI uses.
import { strToU8, zipSync } from 'fflate';
import { serializeGear } from '../format/gearText';
import { toJson } from '../format/json';
import type { Project } from '../model';
import type { Solution } from '../solver';
import { gearsCsv } from './csv';
import { layoutDxf, partDxf } from './dxf';
import { fusionScript } from './fusion';
import { specHtml } from './spec';
import { partStep } from './step';

export interface BundleFile {
  name: string;
  data: string;
}

export interface BundleOptions {
  kerfDxf: boolean;
  kerfStep: boolean;
  version: string;
}

export interface Bundle {
  files: BundleFile[];
  errors: { part: string; message: string }[];
}

const safe = (s: string) => s.replace(/[^A-Za-z0-9_.-]/g, '_');

export function partBaseName(p: Project, id: string): string {
  const pitch = `${p.pitch.system === 'module' ? 'm' : 'dp'}${p.pitch.value}`;
  const gear = p.gears.find((g) => g.id === id);
  if (gear) return safe(`${id}_z${gear.teeth}_${pitch}`);
  const rack = p.racks.find((r) => r.id === id);
  return safe(`${id}_n${rack?.teeth ?? 0}_${pitch}`);
}

export function exportBundle(p: Project, s: Solution, opts: BundleOptions): Bundle {
  if (!s.ok) {
    return { files: [], errors: s.issues.filter((i) => i.severity === 'error').map((i) => ({ part: i.refs[0] ?? '', message: i.message })) };
  }
  const files: BundleFile[] = [];
  const errors: Bundle['errors'] = [];
  const attempt = (part: string, name: string, make: () => string) => {
    try {
      files.push({ name, data: make() });
    } catch (e) {
      errors.push({ part, message: `${name}: ${(e as Error).message}` });
    }
  };
  for (const id of [...p.gears.map((g) => g.id), ...p.racks.map((r) => r.id)]) {
    const base = partBaseName(p, id);
    attempt(id, `${base}.dxf`, () => partDxf(p, s, id, { kerf: opts.kerfDxf }));
    attempt(id, `${base}.step`, () => partStep(p, s, id, { kerf: opts.kerfStep }));
  }
  attempt('', 'layout.dxf', () => layoutDxf(p, s, { kerf: false }));
  // Fusion runs a script from a folder of the same name, so ship it that way.
  files.push({ name: 'geartrain_params/geartrain_params.py', data: fusionScript(p, s, opts.version) });
  files.push({ name: 'spec.html', data: specHtml(p, s, opts.version) });
  files.push({ name: 'geartrain.json', data: toJson(p, s) });
  files.push({ name: 'geartrain.csv', data: gearsCsv(p, s) });
  files.push({ name: 'project.gear', data: serializeGear(p) });
  return { files, errors };
}

export function zipBundle(files: BundleFile[]): Uint8Array {
  return zipSync(Object.fromEntries(files.map((f) => [f.name, strToU8(f.data)])));
}

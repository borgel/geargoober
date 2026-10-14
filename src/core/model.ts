// Project data model. All lengths in mm; angles in degrees at this boundary.

export type Bore =
  | { kind: 'round'; dia: number }
  | { kind: 'dflat'; dia: number; flatDepth: number }
  | { kind: 'hex'; acrossFlats: number }
  | { kind: 'square'; side: number };

export interface Shaft {
  id: string;
  name: string;
  bore: Bore;
}

export interface Gear {
  id: string;
  name: string;
  shaftId: string;
  teeth: number;
  faceWidth: number;
  zOffset: number;
}

export interface Rack {
  id: string;
  name: string;
  teeth: number;
  faceWidth: number;
  backHeight: number;
}

export interface Mesh {
  /** Gear id. */
  a: string;
  /** Gear or rack id. */
  b: string;
  /** Direction from a's shaft to b's shaft (or toward the rack pitch line). */
  angleDeg: number;
  /** Rack meshes only: contact x along the rack, used when the gear is placed from the rack. */
  offset?: number;
}

export type Input =
  | { kind: 'shaft'; shaftId: string; rpm: number }
  | { kind: 'rack'; rackId: string; mmPerSec: number };

export interface Fit {
  backlashMm: number;
  clearanceCoef: number;
  kerfMm: number;
  cornerReliefMm: number;
}

export interface ExportPrefs {
  kerfDxf: boolean;
  kerfStep: boolean;
}

export interface Project {
  name: string;
  pitch: { system: 'module' | 'dp'; value: number };
  pressureAngleDeg: number;
  fit: Fit;
  input: Input;
  shafts: Shaft[];
  gears: Gear[];
  racks: Rack[];
  meshes: Mesh[];
  exportPrefs: ExportPrefs;
}

export const DEFAULT_FIT: Fit = { backlashMm: 0.1, clearanceCoef: 0.25, kerfMm: 0, cornerReliefMm: 0.2 };
export const DEFAULT_EXPORT_PREFS: ExportPrefs = { kerfDxf: true, kerfStep: false };
export const DEFAULT_RACK_BACK = 5;

export function newProject(): Project {
  return {
    name: 'Untitled',
    pitch: { system: 'module', value: 1 },
    pressureAngleDeg: 20,
    fit: { ...DEFAULT_FIT },
    input: { kind: 'shaft', shaftId: '', rpm: 0 },
    shafts: [],
    gears: [],
    racks: [],
    meshes: [],
    exportPrefs: { ...DEFAULT_EXPORT_PREFS },
  };
}

/** Largest distance from the shaft center to the bore edge. */
export function boreRadius(bore: Bore): number {
  switch (bore.kind) {
    case 'round':
    case 'dflat':
      return bore.dia / 2;
    case 'hex':
      return bore.acrossFlats / Math.sqrt(3);
    case 'square':
      return (bore.side * Math.SQRT2) / 2;
  }
}

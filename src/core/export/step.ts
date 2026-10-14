// Hand-written ISO 10303-21 (STEP AP214) export: each part as one extruded MANIFOLD_SOLID_BREP.
// The 2D profile (outer CCW, holes CW — material always on the left) is swept from z = 0 to z = h.
import { partProfile, type PartOptions } from '../geometry/parts';
import { segStart, segTangent } from '../geometry/sample';
import type { Loop, Segment } from '../geometry/types';
import type { Project } from '../model';
import type { Solution } from '../solver';
import { rightNormal, type Vec2 } from '../vec';
import { ExportError } from './dxf';

type V3 = [number, number, number];

function real(x: number): string {
  if (Math.abs(x) < 1e-13) return '0.';
  let s = x.toFixed(10).replace(/0+$/, '');
  if (s.endsWith('.')) return s;
  if (!s.includes('.')) s += '.';
  return s;
}

const str = (s: string) => `'${s.replace(/'/g, "''").replace(/[^\x20-\x7e]/g, '_')}'`;

class StepWriter {
  private lines: string[] = [];
  private next = 1;

  add(entity: string): number {
    const id = this.next++;
    this.lines.push(`#${id}=${entity};`);
    return id;
  }

  point(p: V3): number {
    return this.add(`CARTESIAN_POINT('',(${p.map(real).join(',')}))`);
  }

  dir(d: V3): number {
    return this.add(`DIRECTION('',(${d.map(real).join(',')}))`);
  }

  axis(origin: V3, z: V3, x: V3): number {
    return this.add(`AXIS2_PLACEMENT_3D('',#${this.point(origin)},#${this.dir(z)},#${this.dir(x)})`);
  }

  body(): string {
    return this.lines.join('\n');
  }
}

interface LoopTopo {
  segs: Segment[];
  bottom: number[]; // EDGE_CURVE ids at z = 0
  top: number[]; // EDGE_CURVE ids at z = h
  vertical: number[]; // EDGE_CURVE ids from bottom vertex i to top vertex i
  bottomCurves: number[];
}

function buildLoop(w: StepWriter, loop: Loop, h: number): LoopTopo {
  const k = loop.length;
  const at = (p: Vec2, z: number): V3 => [p.x, p.y, z];
  const vb = loop.map((s) => w.add(`VERTEX_POINT('',#${w.point(at(segStart(s), 0))})`));
  const vt = loop.map((s) => w.add(`VERTEX_POINT('',#${w.point(at(segStart(s), h))})`));

  const curve = (s: Segment, z: number): { id: number; sense: boolean } => {
    if (s.kind === 'line') {
      const d = segTangent(s, 0);
      const length = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
      const vec = w.add(`VECTOR('',#${w.dir([d.x, d.y, 0])},${real(length)})`);
      return { id: w.add(`LINE('',#${w.point(at(s.a, z))},#${vec})`), sense: true };
    }
    if (s.kind === 'arc') {
      const ax = w.axis(at(s.center, z), [0, 0, 1], [1, 0, 0]);
      return { id: w.add(`CIRCLE('',#${ax},${real(s.r)})`), sense: s.end > s.start };
    }
    const pts = s.p.map((q) => `#${w.point(at(q, z))}`).join(',');
    return {
      id: w.add(`B_SPLINE_CURVE_WITH_KNOTS('',3,(${pts}),.UNSPECIFIED.,.F.,.F.,(4,4),(0.,1.),.UNSPECIFIED.)`),
      sense: true,
    };
  };

  const bottom: number[] = [];
  const top: number[] = [];
  const bottomCurves: number[] = [];
  loop.forEach((s, i) => {
    const j = (i + 1) % k;
    const cb = curve(s, 0);
    const ct = curve(s, h);
    bottomCurves.push(cb.id);
    bottom.push(w.add(`EDGE_CURVE('',#${vb[i]},#${vb[j]},#${cb.id},${cb.sense ? '.T.' : '.F.'})`));
    top.push(w.add(`EDGE_CURVE('',#${vt[i]},#${vt[j]},#${ct.id},${ct.sense ? '.T.' : '.F.'})`));
  });
  const vertical = loop.map((s, i) => {
    const vec = w.add(`VECTOR('',#${w.dir([0, 0, 1])},${real(h)})`);
    const line = w.add(`LINE('',#${w.point(at(segStart(s), 0))},#${vec})`);
    return w.add(`EDGE_CURVE('',#${vb[i]},#${vt[i]},#${line},.T.)`);
  });
  return { segs: loop, bottom, top, vertical, bottomCurves };
}

function sideFaces(w: StepWriter, t: LoopTopo, h: number): number[] {
  const k = t.segs.length;
  const oe = (edge: number, fwd: boolean) => w.add(`ORIENTED_EDGE('',*,*,#${edge},${fwd ? '.T.' : '.F.'})`);
  return t.segs.map((s, i) => {
    const j = (i + 1) % k;
    const loop = w.add(`EDGE_LOOP('',(#${oe(t.bottom[i], true)},#${oe(t.vertical[j], true)},#${oe(t.top[i], false)},#${oe(t.vertical[i], false)}))`);
    const bound = w.add(`FACE_OUTER_BOUND('',#${loop},.T.)`);
    let surface: number;
    let sense = true;
    if (s.kind === 'line') {
      const d = segTangent(s, 0);
      const nrm = rightNormal(d);
      surface = w.add(`PLANE('',#${w.axis([s.a.x, s.a.y, 0], [nrm.x, nrm.y, 0], [d.x, d.y, 0])})`);
    } else if (s.kind === 'arc') {
      surface = w.add(`CYLINDRICAL_SURFACE('',#${w.axis([s.center.x, s.center.y, 0], [0, 0, 1], [1, 0, 0])},${real(s.r)})`);
      sense = s.end > s.start;
    } else {
      const vec = w.add(`VECTOR('',#${w.dir([0, 0, 1])},${real(h)})`);
      surface = w.add(`SURFACE_OF_LINEAR_EXTRUSION('',#${t.bottomCurves[i]},#${vec})`);
    }
    return w.add(`ADVANCED_FACE('',(#${bound}),#${surface},${sense ? '.T.' : '.F.'})`);
  });
}

function capFace(w: StepWriter, loops: LoopTopo[], h: number, isTop: boolean): number {
  const oe = (edge: number, fwd: boolean) => w.add(`ORIENTED_EDGE('',*,*,#${edge},${fwd ? '.T.' : '.F.'})`);
  const bounds = loops.map((t, li) => {
    const edges = isTop ? t.top.map((e) => oe(e, true)) : [...t.bottom].reverse().map((e) => oe(e, false));
    const loop = w.add(`EDGE_LOOP('',(${edges.map((e) => `#${e}`).join(',')}))`);
    return w.add(`${li === 0 ? 'FACE_OUTER_BOUND' : 'FACE_BOUND'}('',#${loop},.T.)`);
  });
  const plane = w.add(`PLANE('',#${w.axis([0, 0, isTop ? h : 0], [0, 0, isTop ? 1 : -1], [1, 0, 0])})`);
  return w.add(`ADVANCED_FACE('',(${bounds.map((b) => `#${b}`).join(',')}),#${plane},.T.)`);
}

export function partStep(p: Project, s: Solution, id: string, opts: PartOptions, timestamp = '2000-01-01T00:00:00'): string {
  const r = partProfile(p, s, id, opts);
  if (!r.ok) throw new ExportError(r.error);
  const part = p.gears.find((g) => g.id === id) ?? p.racks.find((x) => x.id === id)!;
  const h = part.faceWidth;
  const w = new StepWriter();

  const appCtx = w.add(`APPLICATION_CONTEXT('core data for automotive mechanical design processes')`);
  w.add(`APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,#${appCtx})`);
  const prodCtx = w.add(`PRODUCT_CONTEXT('',#${appCtx},'mechanical')`);
  const product = w.add(`PRODUCT(${str(id)},${str(part.name)},'',(#${prodCtx}))`);
  const formation = w.add(`PRODUCT_DEFINITION_FORMATION('','',#${product})`);
  const defCtx = w.add(`PRODUCT_DEFINITION_CONTEXT('part definition',#${appCtx},'design')`);
  const def = w.add(`PRODUCT_DEFINITION('design','',#${formation},#${defCtx})`);
  const defShape = w.add(`PRODUCT_DEFINITION_SHAPE('','',#${def})`);
  w.add(`PRODUCT_RELATED_PRODUCT_CATEGORY('part',$,(#${product}))`);
  const lenUnit = w.add(`(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.))`);
  const angUnit = w.add(`(NAMED_UNIT(*)PLANE_ANGLE_UNIT()SI_UNIT($,.RADIAN.))`);
  const solidAng = w.add(`(NAMED_UNIT(*)SI_UNIT($,.STERADIAN.)SOLID_ANGLE_UNIT())`);
  const unc = w.add(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-07),#${lenUnit},'distance_accuracy_value','confusion accuracy')`);
  const ctx = w.add(
    `(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#${unc}))GLOBAL_UNIT_ASSIGNED_CONTEXT((#${lenUnit},#${angUnit},#${solidAng}))REPRESENTATION_CONTEXT('Context #1','3D Context with UNIT and UNCERTAINTY'))`,
  );

  const loops = [r.profile.outer, ...r.profile.holes].map((l) => buildLoop(w, l, h));
  const faces = [capFace(w, loops, h, false), capFace(w, loops, h, true), ...loops.flatMap((t) => sideFaces(w, t, h))];
  const shell = w.add(`CLOSED_SHELL('',(${faces.map((f) => `#${f}`).join(',')}))`);
  const brep = w.add(`MANIFOLD_SOLID_BREP(${str(id)},#${shell})`);
  const origin = w.axis([0, 0, 0], [0, 0, 1], [1, 0, 0]);
  const rep = w.add(`ADVANCED_BREP_SHAPE_REPRESENTATION(${str(id)},(#${brep},#${origin}),#${ctx})`);
  w.add(`SHAPE_DEFINITION_REPRESENTATION(#${defShape},#${rep})`);

  return [
    'ISO-10303-21;',
    'HEADER;',
    `FILE_DESCRIPTION(('GearGoober part ${id.replace(/'/g, '')}'),'2;1');`,
    `FILE_NAME(${str(id + '.step')},'${timestamp}',(''),(''),'GearGoober','GearGoober','');`,
    "FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));",
    'ENDSEC;',
    'DATA;',
    w.body(),
    'ENDSEC;',
    'END-ISO-10303-21;',
    '',
  ].join('\n');
}

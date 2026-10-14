// DXF (AC1015 / R2000, mm) writer for part outlines and the assembled layout.
import { partProfile, type PartOptions } from '../geometry/parts';
import { transformLoop } from '../geometry/sample';
import type { Loop, Segment } from '../geometry/types';
import type { Project } from '../model';
import type { Solution } from '../solver';
import { add, polar, rot, type Vec2 } from '../vec';
import { DXF_HEAD, DXF_TAIL, FIRST_FREE_HANDLE, MODEL_SPACE_HANDLE } from './dxfTemplate';

export class ExportError extends Error {}

const RAD2DEG = 180 / Math.PI;

function n(x: number): string {
  if (Math.abs(x) < 1e-12) return '0.0';
  const s = x.toFixed(9).replace(/0+$/, '');
  return s.endsWith('.') ? s + '0' : s;
}

const code = (c: number) => String(c).padStart(3, ' ');

class DxfWriter {
  private handle = FIRST_FREE_HANDLE;
  private out: string[] = [];

  private entity(type: string, layer: string, subclass: string): void {
    this.pair(0, type);
    this.pair(5, (this.handle++).toString(16).toUpperCase());
    this.pair(330, MODEL_SPACE_HANDLE);
    this.pair(100, 'AcDbEntity');
    this.pair(8, layer);
    this.pair(100, subclass);
  }

  private pair(c: number, value: string | number): void {
    this.out.push(code(c), typeof value === 'number' ? n(value) : value);
  }

  private xyz(base: number, p: Vec2): void {
    this.pair(base, p.x);
    this.pair(base + 10, p.y);
    this.pair(base + 20, 0);
  }

  line(a: Vec2, b: Vec2, layer: string): void {
    this.entity('LINE', layer, 'AcDbLine');
    this.xyz(10, a);
    this.xyz(11, b);
  }

  circle(c: Vec2, r: number, layer: string): void {
    this.entity('CIRCLE', layer, 'AcDbCircle');
    this.xyz(10, c);
    this.pair(40, r);
  }

  /** DXF arcs always run CCW from start to end angle; clockwise arcs swap their ends. */
  arc(c: Vec2, r: number, start: number, end: number, layer: string): void {
    const [a0, a1] = end > start ? [start, end] : [end, start];
    this.entity('ARC', layer, 'AcDbCircle');
    this.xyz(10, c);
    this.pair(40, r);
    this.pair(100, 'AcDbArc');
    this.pair(50, a0 * RAD2DEG);
    this.pair(51, a1 * RAD2DEG);
  }

  point(p: Vec2, layer: string): void {
    this.entity('POINT', layer, 'AcDbPoint');
    this.xyz(10, p);
  }

  text(p: Vec2, height: number, value: string, layer: string): void {
    this.entity('TEXT', layer, 'AcDbText');
    this.xyz(10, p);
    this.pair(40, height);
    this.pair(1, value.replace(/[\r\n]+/g, ' '));
    this.pair(100, 'AcDbText');
  }

  bezier(p: [Vec2, Vec2, Vec2, Vec2], layer: string): void {
    this.entity('SPLINE', layer, 'AcDbSpline');
    this.pair(210, 0);
    this.pair(220, 0);
    this.pair(230, 1);
    this.out.push(code(70), '8', code(71), '3', code(72), '8', code(73), '4', code(74), '0');
    this.pair(42, '0.0000000001');
    this.pair(43, '0.0000000001');
    for (const k of [0, 0, 0, 0, 1, 1, 1, 1]) this.pair(40, k);
    for (const q of p) this.xyz(10, q);
  }

  segment(s: Segment, layer: string): void {
    if (s.kind === 'line') this.line(s.a, s.b, layer);
    else if (s.kind === 'arc') this.arc(s.center, s.r, s.start, s.end, layer);
    else this.bezier(s.p, layer);
  }

  loop(loop: Loop, layer: string): void {
    for (const s of loop) this.segment(s, layer);
  }

  cross(c: Vec2, size: number, layer: string): void {
    this.line({ x: c.x - size, y: c.y }, { x: c.x + size, y: c.y }, layer);
    this.line({ x: c.x, y: c.y - size }, { x: c.x, y: c.y + size }, layer);
  }

  toString(): string {
    const head = DXF_HEAD.replace('{{HANDSEED}}', this.handle.toString(16).toUpperCase());
    return head + this.out.join('\n') + (this.out.length ? '\n' : '') + DXF_TAIL;
  }
}

function profileOrThrow(p: Project, s: Solution, id: string, opts: PartOptions) {
  const r = partProfile(p, s, id, opts);
  if (!r.ok) throw new ExportError(r.error);
  return r;
}

/** One part in its own coordinates: shaft center (gear) or pitch-line middle (rack) at the origin. */
export function partDxf(p: Project, s: Solution, id: string, opts: PartOptions): string {
  const w = new DxfWriter();
  const r = profileOrThrow(p, s, id, opts);
  w.loop(r.profile.outer, 'PROFILE');
  for (const h of r.profile.holes) w.loop(h, 'BORE');
  const origin = { x: 0, y: 0 };
  if (r.kind === 'gear') {
    w.circle(origin, s.gears.find((g) => g.id === id)!.pitchR, 'PITCH_CIRCLE');
  } else {
    const rs = s.racks.find((x) => x.id === id)!;
    w.line({ x: -rs.length / 2, y: 0 }, { x: rs.length / 2, y: 0 }, 'PITCH_CIRCLE');
  }
  w.point(origin, 'CENTER');
  w.cross(origin, s.module, 'CENTER');
  return w.toString();
}

/** All parts at their assembled positions with shaft markers and center-distance annotations. */
export function layoutDxf(p: Project, s: Solution, opts: Omit<PartOptions, 'zeroPhase'>): string {
  const w = new DxfWriter();
  const m = s.module;
  const textH = Math.max(1, m * 1.5);
  const shaftPos = new Map(s.shafts.map((x) => [x.id, { x: x.x, y: x.y }]));
  for (const g of s.gears) {
    const r = profileOrThrow(p, s, g.id, opts);
    w.loop(transformLoop(r.profile.outer, 0, g.x, g.y), 'PROFILE');
    for (const h of r.profile.holes) w.loop(transformLoop(h, 0, g.x, g.y), 'BORE');
    w.circle({ x: g.x, y: g.y }, g.pitchR, 'PITCH_CIRCLE');
    w.text({ x: g.x + m, y: g.y + m }, textH, g.id, 'LABELS');
  }
  for (const rs of s.racks) {
    const r = profileOrThrow(p, s, rs.id, opts);
    w.loop(transformLoop(r.profile.outer, rs.angle, rs.origin.x, rs.origin.y), 'PROFILE');
    const t = polar(1, rs.angle);
    const half = rs.length / 2;
    w.line(add(rs.origin, { x: -t.x * half, y: -t.y * half }), add(rs.origin, { x: t.x * half, y: t.y * half }), 'PITCH_CIRCLE');
    w.text(add(rs.origin, rot({ x: 0, y: -4 * m }, rs.angle)), textH, rs.id, 'LABELS');
  }
  for (const sh of s.shafts) {
    w.point(sh, 'SHAFTS');
    w.cross(sh, m, 'SHAFTS');
  }
  for (const ms of s.meshes) {
    const ga = s.gears.find((g) => g.id === ms.a)!;
    const a = shaftPos.get(ga.shaftId)!;
    const gb = s.gears.find((g) => g.id === ms.b);
    let b: Vec2;
    if (gb) b = shaftPos.get(gb.shaftId)!;
    else {
      const rs = s.racks.find((x) => x.id === ms.b)!;
      b = add(rs.origin, polar(ms.contactX ?? 0, rs.angle));
    }
    w.line(a, b, 'DIMENSIONS');
    w.text({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, textH, `cd ${ms.centerDist.toFixed(3)}`, 'DIMENSIONS');
  }
  return w.toString();
}

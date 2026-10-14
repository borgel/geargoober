import type { Vec2 } from '../vec';

export interface LineSeg {
  kind: 'line';
  a: Vec2;
  b: Vec2;
}

/** Circular arc traversed from `start` to `end` (radians). end > start ⇒ counter-clockwise. */
export interface ArcSeg {
  kind: 'arc';
  center: Vec2;
  r: number;
  start: number;
  end: number;
}

/** Cubic Bézier; exported as a degree-3 B-spline with knots (0,0,0,0,1,1,1,1). */
export interface BezierSeg {
  kind: 'bezier';
  p: [Vec2, Vec2, Vec2, Vec2];
}

export type Segment = LineSeg | ArcSeg | BezierSeg;

/** Closed loop of end-to-end segments. */
export type Loop = Segment[];

/** Outer loop is counter-clockwise; holes are clockwise. */
export interface Profile {
  outer: Loop;
  holes: Loop[];
}

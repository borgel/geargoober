// Closed-form gear relations shared by the solver and geometry.

/** Involute function. */
export const inv = (phi: number): number => Math.tan(phi) - phi;

export interface ToothParams {
  m: number;
  z: number;
  paRad: number;
  backlash: number;
  clearanceCoef: number;
}

export function radii(p: ToothParams) {
  const pitchR = (p.m * p.z) / 2;
  return {
    pitchR,
    outerR: pitchR + p.m,
    rootR: pitchR - (1 + p.clearanceCoef) * p.m,
    baseR: pitchR * Math.cos(p.paRad),
  };
}

/** Half the angular tooth thickness at the pitch circle (backlash applied). */
export function pitchHalfAngle(p: ToothParams): number {
  const s = (Math.PI * p.m) / 2 - p.backlash / 2;
  return s / (2 * ((p.m * p.z) / 2));
}

/** Angle from tooth center line to the flank at radius rho (rho >= base radius). */
export function flankAngleAt(p: ToothParams, rho: number): number {
  const { baseR } = radii(p);
  const phi = Math.acos(Math.min(1, baseR / rho));
  return pitchHalfAngle(p) + inv(p.paRad) - inv(phi);
}

/** Half-angle of the tip land; <= 0 means the tooth comes to a point below the tip circle. */
export function toothTipHalfAngle(p: ToothParams): number {
  return flankAngleAt(p, radii(p).outerR);
}

/** Smallest tooth count without undercut for a standard rack cutter. */
export const undercutLimit = (paRad: number): number => Math.round(2 / Math.sin(paRad) ** 2);

export function contactRatioGears(a: ToothParams, b: ToothParams, centerDist: number): number {
  const ra = radii(a);
  const rb = radii(b);
  const pa = a.paRad;
  const num =
    Math.sqrt(ra.outerR ** 2 - ra.baseR ** 2) + Math.sqrt(rb.outerR ** 2 - rb.baseR ** 2) - centerDist * Math.sin(pa);
  return num / (Math.PI * a.m * Math.cos(pa));
}

export function contactRatioRack(g: ToothParams): number {
  const r = radii(g);
  const pa = g.paRad;
  const num = Math.sqrt(r.outerR ** 2 - r.baseR ** 2) - r.pitchR * Math.sin(pa) + g.m / Math.sin(pa);
  return num / (Math.PI * g.m * Math.cos(pa));
}

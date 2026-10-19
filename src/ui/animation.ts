// Animation timing. A rack can't slide forever, so trains with a driven rack swing back and forth.

export interface RackMotion {
  length: number;
  pitch: number;
  /** Rack-local x of the contact point. */
  contactX: number;
  mmPerSec: number;
}

/**
 * Seconds of motion before the first rack would run its contact point off its teeth,
 * or undefined when nothing limits travel.
 */
export function rackTravelSeconds(racks: RackMotion[]): number | undefined {
  let best: number | undefined;
  for (const r of racks) {
    if (!r.mmPerSec) continue;
    const travel = Math.max(0, r.length / 2 - r.pitch - Math.abs(r.contactX));
    const secs = travel / Math.abs(r.mmPerSec);
    best = best === undefined ? secs : Math.min(best, secs);
  }
  return best;
}

/** Elapsed time → animation time: unchanged, or a triangle wave 0 → A → 0 → −A → 0 when travel is limited. */
export function animationClock(t: number, limit: number | undefined): number {
  if (limit === undefined) return t;
  if (limit <= 0) return 0;
  const phase = ((t % (4 * limit)) + 4 * limit) % (4 * limit);
  if (phase <= limit) return phase;
  if (phase <= 3 * limit) return 2 * limit - phase;
  return phase - 4 * limit;
}

/** Share of each tick spent moving; the rest is the escapement's hold. */
export const SNAP_FRACTION = 0.15;

/**
 * Elapsed time → stepped time for an escapement: hold, then snap forward one tick's worth with an
 * ease-out. Lands exactly on n / ticksPerSec after each snap, so the average speed is unchanged.
 */
export function steppedTime(t: number, ticksPerSec: number | undefined): number {
  if (!ticksPerSec || !(ticksPerSec > 0)) return t;
  const ticks = t * ticksPerSec;
  const n = Math.floor(ticks);
  const u = Math.min(1, (ticks - n) / SNAP_FRACTION);
  return (n + 1 - (1 - u) * (1 - u)) / ticksPerSec;
}

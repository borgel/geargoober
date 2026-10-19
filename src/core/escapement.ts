// Escapement: the whole train moves in discrete steps at the input's average speed.

/** Above this the animation can't show separate steps (one per screen refresh). */
export const MAX_VISIBLE_TICKS = 60;

/** Degrees a shaft at `rpm` turns per tick; undefined for smooth motion. */
export function stepPerTick(rpm: number, ticksPerSec: number | undefined): number | undefined {
  return ticksPerSec ? (rpm * 6) / ticksPerSec : undefined;
}

/** Millimetres a rack at `mmPerSec` moves per tick; undefined for smooth motion. */
export function mmPerTick(mmPerSec: number, ticksPerSec: number | undefined): number | undefined {
  return ticksPerSec ? mmPerSec / ticksPerSec : undefined;
}

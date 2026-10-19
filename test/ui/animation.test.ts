import { describe, expect, it } from 'vitest';
import { SNAP_FRACTION, animationClock, rackTravelSeconds, steppedTime } from '../../src/ui/animation';

describe('animationClock', () => {
  it('runs continuously when there is no rack', () => {
    expect(animationClock(12.5, undefined)).toBe(12.5);
  });

  it('swings back and forth when a rack limits travel', () => {
    const A = 2;
    const pts = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((t) => animationClock(t, A));
    expect(pts).toEqual([0, 1, 2, 1, 0, -1, -2, -1, 0]);
  });
});

describe('rackTravelSeconds', () => {
  it('uses the slowest-limiting rack and keeps the contact on the teeth', () => {
    // 100 mm rack, pitch π, contact at 10 mm: travel = 50 − π − 10 each way; at 20 mm/s
    const secs = rackTravelSeconds([{ length: 100, pitch: Math.PI, contactX: 10, mmPerSec: 20 }]);
    expect(secs).toBeCloseTo((50 - Math.PI - 10) / 20, 9);
  });

  it('is undefined for trains without a moving rack', () => {
    expect(rackTravelSeconds([])).toBeUndefined();
    expect(rackTravelSeconds([{ length: 100, pitch: 3, contactX: 0, mmPerSec: 0 }])).toBeUndefined();
  });

  it('never returns a negative travel', () => {
    expect(rackTravelSeconds([{ length: 10, pitch: 3, contactX: 4, mmPerSec: 5 }])).toBe(0);
  });
});

describe('steppedTime', () => {
  it('passes time through when there is no escapement', () => {
    expect(steppedTime(3.7, undefined)).toBe(3.7);
  });

  it('holds between ticks and lands exactly on each tick', () => {
    // 2 ticks/s: each tick advances 0.5 s of motion
    expect(steppedTime(0, 2)).toBe(0);
    expect(steppedTime(0.4, 2)).toBeCloseTo(0.5, 12);
    expect(steppedTime(0.45, 2)).toBeCloseTo(0.5, 12);
    expect(steppedTime(1.3, 2)).toBeCloseTo(1.5, 12);
  });

  it('snaps quickly and monotonically at the start of a tick', () => {
    const a = steppedTime(0.01, 1);
    const b = steppedTime(0.05, 1);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(b).toBeLessThan(1);
    expect(steppedTime(SNAP_FRACTION, 1)).toBeCloseTo(1, 12);
  });

  it('keeps the average speed', () => {
    expect(steppedTime(100.9, 3)).toBeCloseTo(101, 9);
  });
});

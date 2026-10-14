import { expect } from 'vitest';
import { segEnd, segStart } from '../../src/core/geometry/sample';
import type { Loop } from '../../src/core/geometry/types';
import { dist } from '../../src/core/vec';

export function expectClosed(loop: Loop, tol = 1e-9) {
  for (let i = 0; i < loop.length; i++) {
    const next = loop[(i + 1) % loop.length];
    expect(dist(segEnd(loop[i]), segStart(next))).toBeLessThan(tol);
  }
}

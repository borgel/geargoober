// Loads STEP text with OpenCascade (occt-import-js, test-only) and measures the resulting mesh.
import occtFactory from 'occt-import-js';

let occtPromise: Promise<any> | undefined;
const occt = () => (occtPromise ??= (occtFactory as any)());

export interface StepMeasure {
  success: boolean;
  meshes: number;
  volume: number;
  min: [number, number, number];
  max: [number, number, number];
}

export async function measureStep(step: string): Promise<StepMeasure> {
  const o = await occt();
  const r = o.ReadStepFile(new TextEncoder().encode(step), {
    linearUnit: 'millimeter',
    linearDeflectionType: 'absolute_value',
    linearDeflection: 0.002,
    angularDeflection: 0.05,
  });
  let volume = 0;
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const mesh of r.meshes ?? []) {
    const pos: number[] = mesh.attributes.position.array;
    const idx: number[] = mesh.index.array;
    for (let i = 0; i < pos.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], pos[i + k]);
        max[k] = Math.max(max[k], pos[i + k]);
      }
    }
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t] * 3;
      const b = idx[t + 1] * 3;
      const c = idx[t + 2] * 3;
      const [ax, ay, az] = [pos[a], pos[a + 1], pos[a + 2]];
      const [bx, by, bz] = [pos[b], pos[b + 1], pos[b + 2]];
      const [cx, cy, cz] = [pos[c], pos[c + 1], pos[c + 2]];
      volume += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
    }
  }
  return { success: r.success, meshes: (r.meshes ?? []).length, volume, min, max };
}

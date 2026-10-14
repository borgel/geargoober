import type { Project } from '../core/model';
import { NumField, Select } from './fields';
import type { Store } from './state';

export function ProjectPanel({ store }: { store: Store }) {
  const { project: p, update } = store;
  const set = (fn: (q: Project) => void) =>
    update((q) => {
      const c = structuredClone(q);
      fn(c);
      return c;
    });
  const inputTargets = [
    ...p.shafts.map((s) => ({ value: `shaft:${s.id}`, label: `Shaft ${s.id}` })),
    ...p.racks.map((r) => ({ value: `rack:${r.id}`, label: `Rack ${r.id}` })),
  ];
  const inputValue = p.input.kind === 'shaft' ? `shaft:${p.input.shaftId}` : `rack:${p.input.rackId}`;
  const speed = p.input.kind === 'shaft' ? p.input.rpm : p.input.mmPerSec;

  return (
    <section class="panel-section project">
      <label class="field wide">
        <span>Project name</span>
        <input type="text" value={p.name} onInput={(e) => set((q) => (q.name = (e.target as HTMLInputElement).value))} />
      </label>
      <div class="field-row">
        <label class="field">
          <span>Pitch</span>
          <div class="joined">
            <Select
              label="Pitch system"
              value={p.pitch.system}
              options={[
                { value: 'module', label: 'Module' },
                { value: 'dp', label: 'Diametral pitch' },
              ]}
              onChange={(v) => set((q) => (q.pitch.system = v))}
            />
            <NumField label="Pitch value" value={p.pitch.value} onChange={(n) => set((q) => (q.pitch.value = n))} />
          </div>
        </label>
        <label class="field">
          <span>Pressure angle</span>
          <Select
            label="Pressure angle"
            value={String(p.pressureAngleDeg)}
            options={[
              { value: '20', label: '20°' },
              { value: '14.5', label: '14.5°' },
            ]}
            onChange={(v) => set((q) => (q.pressureAngleDeg = Number(v)))}
          />
        </label>
      </div>
      <label class="field wide">
        <span>Input</span>
        <div class="joined">
          <Select
            label="Input part"
            value={inputValue}
            options={inputTargets.length ? inputTargets : [{ value: 'shaft:', label: 'Add a shaft first' }]}
            onChange={(v) =>
              set((q) => {
                const [kind, id] = v.split(':');
                const prev = q.input.kind === 'shaft' ? q.input.rpm : q.input.mmPerSec;
                q.input = kind === 'shaft' ? { kind: 'shaft', shaftId: id, rpm: prev } : { kind: 'rack', rackId: id, mmPerSec: prev };
              })
            }
          />
          <NumField
            label="Input speed"
            value={speed}
            onChange={(n) =>
              set((q) => {
                if (q.input.kind === 'shaft') q.input.rpm = n;
                else q.input.mmPerSec = n;
              })
            }
          />
          <span class="unit">{p.input.kind === 'shaft' ? 'rpm' : 'mm/s'}</span>
        </div>
      </label>
      <details class="fit">
        <summary>Fit allowances</summary>
        <div class="field-grid">
          <label class="field">
            <span>Backlash (mm)</span>
            <NumField label="Backlash" value={p.fit.backlashMm} onChange={(n) => set((q) => (q.fit.backlashMm = n))} />
          </label>
          <label class="field">
            <span>Root clearance (× module)</span>
            <NumField label="Clearance" value={p.fit.clearanceCoef} onChange={(n) => set((q) => (q.fit.clearanceCoef = n))} />
          </label>
          <label class="field">
            <span>Cutter kerf (mm)</span>
            <NumField label="Kerf" value={p.fit.kerfMm} onChange={(n) => set((q) => (q.fit.kerfMm = n))} />
          </label>
          <label class="field">
            <span>Bore corner radius (mm)</span>
            <NumField label="Corner relief" value={p.fit.cornerReliefMm} onChange={(n) => set((q) => (q.fit.cornerReliefMm = n))} />
          </label>
        </div>
      </details>
    </section>
  );
}

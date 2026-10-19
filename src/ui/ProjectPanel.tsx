import type { Project } from '../core/model';
import { NumField, Select } from './fields';
import { HelpButton } from './help';
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
        <div class="field">
          <span>
            {p.pitch.system === 'module' ? 'Module' : 'Diametral pitch'} <HelpButton topic="module" about="module and diametral pitch" />
          </span>
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
            <NumField
              label="Pitch value"
              unit={p.pitch.system === 'module' ? 'mm' : 'teeth/in'}
              value={p.pitch.value}
              onChange={(n) => set((q) => (q.pitch.value = n))}
            />
          </div>
        </div>
        <div class="field">
          <span>
            Pressure angle <HelpButton topic="pressure-angle" about="pressure angle" />
          </span>
          <Select
            label="Pressure angle"
            value={String(p.pressureAngleDeg)}
            placeholder={`${p.pressureAngleDeg}°`}
            options={[
              { value: '20', label: '20°' },
              { value: '14.5', label: '14.5°' },
            ]}
            onChange={(v) => set((q) => (q.pressureAngleDeg = Number(v)))}
          />
        </div>
      </div>
      <div class="field wide">
        <span>
          Input <HelpButton topic="ratios" about="ratios, idlers and compound gears" />
        </span>
        <div class="joined">
          <Select
            label="Input part"
            value={inputValue}
            options={inputTargets.length ? inputTargets : [{ value: 'shaft:', label: 'Add a shaft first' }]}
            onChange={(v) =>
              set((q) => {
                const [kind, id] = v.split(':');
                const prev = q.input.kind === 'shaft' ? q.input.rpm : q.input.mmPerSec;
                const ticks = q.input.ticksPerSec;
                q.input = kind === 'shaft' ? { kind: 'shaft', shaftId: id, rpm: prev } : { kind: 'rack', rackId: id, mmPerSec: prev };
                if (ticks !== undefined) q.input.ticksPerSec = ticks;
              })
            }
          />
          <NumField
            label="Input speed"
            unit={p.input.kind === 'shaft' ? 'rpm' : 'mm/s'}
            value={speed}
            onChange={(n) =>
              set((q) => {
                if (q.input.kind === 'shaft') q.input.rpm = n;
                else q.input.mmPerSec = n;
              })
            }
          />
        </div>
      </div>
      <div class="field">
        <span>
          Escapement <HelpButton topic="escapement" about="escapements" />
        </span>
        <NumField
          label="Escapement ticks"
          unit="/s"
          value={p.input.ticksPerSec ?? NaN}
          onChange={(n) => set((q) => (q.input.ticksPerSec = n))}
          onClear={() => set((q) => delete q.input.ticksPerSec)}
        />
      </div>
      <details class="fit">
        <summary>Fit allowances</summary>
        <div class="field-grid">
          <div class="field">
            <span>
              Backlash <HelpButton topic="backlash" about="backlash" />
            </span>
            <NumField label="Backlash" unit="mm" value={p.fit.backlashMm} onChange={(n) => set((q) => (q.fit.backlashMm = n))} />
          </div>
          <div class="field">
            <span>
              Root clearance <HelpButton topic="clearance" about="root clearance" />
            </span>
            <NumField label="Clearance" unit="× m" value={p.fit.clearanceCoef} onChange={(n) => set((q) => (q.fit.clearanceCoef = n))} />
          </div>
          <div class="field">
            <span>
              Cutter kerf <HelpButton topic="kerf" about="kerf" />
            </span>
            <NumField label="Kerf" unit="mm" value={p.fit.kerfMm} onChange={(n) => set((q) => (q.fit.kerfMm = n))} />
          </div>
          <div class="field">
            <span>
              Bore corners <HelpButton topic="bores" about="bore corner relief" />
            </span>
            <NumField label="Corner relief" unit="mm" value={p.fit.cornerReliefMm} onChange={(n) => set((q) => (q.fit.cornerReliefMm = n))} />
          </div>
          <label class="field wide-cell">
            <span>Bore corner style</span>
            <Select
              label="Corner relief style"
              value={p.fit.reliefStyle}
              options={[
                { value: 'fillet', label: 'Rounded: snug on rounded stock' },
                { value: 'dogbone', label: 'Dog-bone: clears sharp corners' },
              ]}
              onChange={(v) => set((q) => (q.fit.reliefStyle = v))}
            />
          </label>
        </div>
      </details>
    </section>
  );
}

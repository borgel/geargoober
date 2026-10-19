import { activeTicks, mmPerTick, stepPerTick } from '../core/escapement';
import { fmt } from '../core/export/spec';
import type { Store } from './state';

const DIR = { ccw: 'counter-clockwise', cw: 'clockwise', stopped: 'stopped' } as const;

export function ResultsPanel({ store }: { store: Store }) {
  const { solution: s, project: p, selection, select } = store;
  const ticks = activeTicks(p.input);
  const stepping = ticks !== undefined;
  const sel = (...ids: string[]) => (ids.every((id) => selection.includes(id)) ? 'selected' : '');
  return (
    <section class="readout-block results" data-testid="results">
      <h2>Speeds</h2>
      <table class="data">
        <thead>
          <tr>
            <th>Shaft</th>
            <th>Gears</th>
            <th class="n">rpm</th>
            {stepping && <th class="n">Step / tick</th>}
            <th>Turns</th>
            <th class="n">Torque ×</th>
          </tr>
        </thead>
        <tbody>
          {s.shafts.map((sh) => (
            <tr class={sel(sh.id)} onClick={() => select([sh.id, ...p.gears.filter((g) => g.shaftId === sh.id).map((g) => g.id)])}>
              <td>{sh.id}</td>
              <td>{p.gears.filter((g) => g.shaftId === sh.id).map((g) => `${g.id} (${g.teeth}T)`).join(', ')}</td>
              <td class="n">{fmt(sh.rpm, 2)}</td>
              {stepping && <td class="n">{sh.rpm === undefined ? '—' : `${fmt(stepPerTick(sh.rpm, ticks)!, 3)}°`}</td>}
              <td>{sh.dir ? DIR[sh.dir] : 'not driven'}</td>
              <td class="n">{fmt(sh.torqueRatio, 3)}</td>
            </tr>
          ))}
          {s.racks.map((r) => (
            <tr class={sel(r.id)} onClick={() => select([r.id])}>
              <td>{r.id}</td>
              <td>rack</td>
              <td class="n" colSpan={2}>
                {r.mmPerSec === undefined ? 'not driven' : `${fmt(r.mmPerSec, 2)} mm/s`}
              </td>
              {stepping && <td class="n">{r.mmPerSec === undefined ? '—' : `${fmt(mmPerTick(r.mmPerSec, ticks)!, 3)} mm`}</td>}
              <td />
            </tr>
          ))}
        </tbody>
      </table>
      <h2>Spacing</h2>
      <table class="data">
        <thead>
          <tr>
            <th>Mesh</th>
            <th class="n">Center distance (mm)</th>
            <th class="n">Ratio</th>
            <th class="n">Contact ratio</th>
          </tr>
        </thead>
        <tbody>
          {s.meshes.map((m) => (
            <tr class={sel(m.a, m.b)} onClick={() => select([m.a, m.b])}>
              <td>
                {m.a} – {m.b}
              </td>
              <td class="n">{Number.isFinite(m.centerDist) ? m.centerDist.toFixed(3) : '—'}</td>
              <td class="n">{Number.isFinite(m.ratio) ? `1 : ${fmt(m.ratio, 4)}` : 'rack'}</td>
              <td class="n">{fmt(m.contactRatio, 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

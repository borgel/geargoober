import { suggestMeshAngle } from '../core/meshAngle';
import { addGear, addMesh, addRack, addShaft, removeMesh, removePart, renameId } from '../core/edit';
import type { Bore, Project } from '../core/model';
import { CommitField, NumField, Select } from './fields';
import { HelpButton, type GuideTopic } from './help';
import type { Store } from './state';

const ID_HINT = 'Ids are unique and use letters, digits, _ . or -';

const BORE_KINDS: { value: Bore['kind']; label: string }[] = [
  { value: 'round', label: 'Round' },
  { value: 'dflat', label: 'D-flat' },
  { value: 'hex', label: 'Hex' },
  { value: 'square', label: 'Square' },
];

function defaultBore(kind: Bore['kind'], size: number): Bore {
  switch (kind) {
    case 'round':
      return { kind, dia: size };
    case 'dflat':
      return { kind, dia: size, flatDepth: Math.round(size * 10) / 100 };
    case 'hex':
      return { kind, acrossFlats: size };
    case 'square':
      return { kind, side: size };
  }
}

const boreSize = (b: Bore) => (b.kind === 'hex' ? b.acrossFlats : b.kind === 'square' ? b.side : b.dia);

function Remove({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" class="icon remove" aria-label={label} title={label} onClick={onClick}>
      ×
    </button>
  );
}

function Header({ title, add, onAdd, topic }: { title: string; add: string; onAdd: () => void; topic: GuideTopic }) {
  return (
    <div class="section-head">
      <h2>
        {title} <HelpButton topic={topic} about={title.toLowerCase()} />
      </h2>
      <button type="button" class="add" onClick={onAdd}>
        {add}
      </button>
    </div>
  );
}

/** Sets one end of a mesh and moves the mesh to an angle where the gears don't land on other parts. */
function pickMeshEnd(q: Project, i: number, end: 'a' | 'b', id: string) {
  q.meshes[i][end] = id;
  const angle = suggestMeshAngle(q, i);
  if (angle !== undefined) q.meshes[i].angleDeg = angle;
}

export function ListEditor({ store }: { store: Store }) {
  const { project: p, update, selection } = store;
  const edit = (fn: (q: Project) => void) =>
    update((q) => {
      const c = structuredClone(q);
      fn(c);
      return c;
    });
  const rename = (from: string) => (to: string) => update((q) => renameId(q, from, to));
  const sel = (id: string) => (selection.includes(id) ? 'selected' : '');
  const shaftOptions = p.shafts.map((s) => ({ value: s.id, label: s.id }));
  const gearOptions = p.gears.map((g) => ({ value: g.id, label: g.id }));
  const meshTargets = [...gearOptions, ...p.racks.map((r) => ({ value: r.id, label: r.id }))];

  return (
    <div class="lists">
      <section class="panel-section">
        <Header title="Shafts" topic="bores" add="Add shaft" onAdd={() => update(addShaft)} />
        {p.shafts.length === 0 ? (
          <p class="empty">Add a shaft, then put gears on it.</p>
        ) : (
          <table class="rows">
            <thead>
              <tr>
                <th>Id</th>
                <th>Bore</th>
                <th>Size</th>
                <th>Flat</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {p.shafts.map((s, i) => (
                <tr class={sel(s.id)} key={s.id}>
                  <td>
                    <CommitField class="id" title={ID_HINT} label={`Shaft ${s.id} id`} value={s.id} onCommit={rename(s.id)} />
                  </td>
                  <td>
                    <Select
                      label={`${s.id} bore`}
                      value={s.bore.kind}
                      options={BORE_KINDS}
                      onChange={(kind) => edit((q) => (q.shafts[i].bore = defaultBore(kind, boreSize(s.bore))))}
                    />
                  </td>
                  <td>
                    <NumField
                      label={`${s.id} bore size`}
                      unit="mm"
                      value={boreSize(s.bore)}
                      onChange={(n) =>
                        edit((q) => {
                          const b = q.shafts[i].bore;
                          if (b.kind === 'hex') b.acrossFlats = n;
                          else if (b.kind === 'square') b.side = n;
                          else b.dia = n;
                        })
                      }
                    />
                  </td>
                  <td>
                    {s.bore.kind === 'dflat' ? (
                      <NumField
                        label={`${s.id} flat depth`}
                        unit="mm"
                        value={s.bore.flatDepth}
                        onChange={(n) =>
                          edit((q) => {
                            const b = q.shafts[i].bore;
                            if (b.kind === 'dflat') b.flatDepth = n;
                          })
                        }
                      />
                    ) : null}
                  </td>
                  <td>
                    <Remove label={`Remove shaft ${s.id} and its gears`} onClick={() => update((q) => removePart(q, s.id))} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section class="panel-section">
        <Header title="Gears" topic="teeth" add="Add gear" onAdd={() => update(addGear)} />
        {p.gears.length === 0 ? (
          <p class="empty">Each gear sits on a shaft. Put two gears on one shaft to make a compound gear.</p>
        ) : (
          <table class="rows">
            <thead>
              <tr>
                <th>Id</th>
                <th>Shaft</th>
                <th>Teeth</th>
                <th>
                  Thickness <HelpButton topic="face-width" about="thickness" />
                </th>
                <th>Z</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {p.gears.map((g, i) => (
                <tr class={sel(g.id)} key={g.id}>
                  <td>
                    <CommitField class="id" title={ID_HINT} label={`Gear ${g.id} id`} value={g.id} onCommit={rename(g.id)} />
                  </td>
                  <td>
                    <Select label={`${g.id} shaft`} value={g.shaftId} options={shaftOptions} onChange={(v) => edit((q) => (q.gears[i].shaftId = v))} />
                  </td>
                  <td>
                    <NumField label={`${g.id} teeth`} unit="T" value={g.teeth} onChange={(n) => edit((q) => (q.gears[i].teeth = n))} />
                  </td>
                  <td>
                    <NumField label={`${g.id} thickness`} unit="mm" value={g.faceWidth} onChange={(n) => edit((q) => (q.gears[i].faceWidth = n))} />
                  </td>
                  <td>
                    <NumField label={`${g.id} z offset`} unit="mm" value={g.zOffset} onChange={(n) => edit((q) => (q.gears[i].zOffset = n))} />
                  </td>
                  <td>
                    <Remove label={`Remove gear ${g.id}`} onClick={() => update((q) => removePart(q, g.id))} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section class="panel-section">
        <Header title="Racks" topic="racks" add="Add rack" onAdd={() => update(addRack)} />
        {p.racks.length > 0 && (
          <table class="rows">
            <thead>
              <tr>
                <th>Id</th>
                <th>Teeth</th>
                <th>
                  Thickness <HelpButton topic="face-width" about="thickness" />
                </th>
                <th>Back</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {p.racks.map((r, i) => (
                <tr class={sel(r.id)} key={r.id}>
                  <td>
                    <CommitField class="id" title={ID_HINT} label={`Rack ${r.id} id`} value={r.id} onCommit={rename(r.id)} />
                  </td>
                  <td>
                    <NumField label={`${r.id} teeth`} unit="T" value={r.teeth} onChange={(n) => edit((q) => (q.racks[i].teeth = n))} />
                  </td>
                  <td>
                    <NumField label={`${r.id} thickness`} unit="mm" value={r.faceWidth} onChange={(n) => edit((q) => (q.racks[i].faceWidth = n))} />
                  </td>
                  <td>
                    <NumField label={`${r.id} back height`} unit="mm" value={r.backHeight} onChange={(n) => edit((q) => (q.racks[i].backHeight = n))} />
                  </td>
                  <td>
                    <Remove label={`Remove rack ${r.id}`} onClick={() => update((q) => removePart(q, r.id))} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section class="panel-section">
        <Header title="Meshes" topic="layout" add="Add mesh" onAdd={() => update(addMesh)} />
        {p.meshes.length === 0 ? (
          <p class="empty">A mesh says which two gears touch, and at what angle the second sits from the first.</p>
        ) : (
          <table class="rows">
            <thead>
              <tr>
                <th>Gear</th>
                <th>Meshes with</th>
                <th>Angle</th>
                <th>Offset</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {p.meshes.map((m, i) => {
                const toRack = p.racks.some((r) => r.id === m.b);
                return (
                  <tr class={selection.includes(m.a) && selection.includes(m.b) ? 'selected' : ''} key={`${i}`}>
                    <td>
                      <Select placeholder="Choose…" label={`Mesh ${i + 1} gear`} value={m.a} options={gearOptions} onChange={(v) => edit((q) => pickMeshEnd(q, i, 'a', v))} />
                    </td>
                    <td>
                      <Select placeholder="Choose…" label={`Mesh ${i + 1} partner`} value={m.b} options={meshTargets} onChange={(v) => edit((q) => pickMeshEnd(q, i, 'b', v))} />
                    </td>
                    <td>
                      <NumField label={`Mesh ${i + 1} angle`} unit="°" value={m.angleDeg} onChange={(n) => edit((q) => (q.meshes[i].angleDeg = n))} />
                    </td>
                    <td>
                      {toRack ? (
                        <NumField
                          label={`Mesh ${i + 1} rack offset`}
                          unit="mm"
                          value={m.offset ?? 0}
                          onChange={(n) => edit((q) => (q.meshes[i].offset = n === 0 ? undefined : n))}
                        />
                      ) : null}
                    </td>
                    <td>
                      <Remove label={`Remove mesh ${m.a}–${m.b}`} onClick={() => update((q) => removeMesh(q, i))} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

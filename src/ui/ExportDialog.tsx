import { useEffect, useMemo, useRef } from 'preact/hooks';
import { exportBundle, zipBundle, type BundleFile } from '../core/export/bundle';
import { fmt } from '../core/export/spec';
import { download, safeFileName } from './download';
import type { Store } from './state';

const MIME: Record<string, string> = {
  dxf: 'application/dxf',
  step: 'application/step',
  py: 'text/x-python',
  html: 'text/html',
  json: 'application/json',
  csv: 'text/csv',
  gear: 'text/plain',
};

const DESCRIBE: [RegExp, string][] = [
  [/^layout\.dxf$/, 'Whole train in place, with shaft points and center distances'],
  [/\.dxf$/, '2D outline'],
  [/\.step$/, '3D solid'],
  [/\.py$/, 'Fusion 360 script: parameters + shaft layout sketch'],
  [/\.html$/, 'Printable spec sheet'],
  [/\.json$/, 'Project and results, machine-readable'],
  [/\.csv$/, 'Gear table for spreadsheets'],
  [/\.gear$/, 'Project source (open it again here)'],
];

const describe = (name: string) => DESCRIBE.find(([re]) => re.test(name))?.[1] ?? '';

export function ExportDialog({ store, onClose }: { store: Store; onClose: () => void }) {
  const { project: p, solution: s, update } = store;
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && typeof d.showModal === 'function' && !d.open) d.showModal();
    else d?.setAttribute('open', '');
  }, []);

  const bundle = useMemo(
    () => (s.ok ? exportBundle(p, s, { kerfDxf: p.exportPrefs.kerfDxf, kerfStep: p.exportPrefs.kerfStep, version: __APP_VERSION__ }) : null),
    [p, s],
  );
  const base = safeFileName(p.name);
  const setPref = (key: 'kerfDxf' | 'kerfStep', value: boolean) =>
    update((q) => ({ ...q, exportPrefs: { ...q.exportPrefs, [key]: value } }));
  const save = (f: BundleFile) => download(f.name, f.data, MIME[f.name.split('.').pop() ?? ''] ?? 'text/plain');
  const kerf = p.fit.kerfMm;

  return (
    <dialog ref={ref} class="export" aria-labelledby="export-title" onClose={onClose} onCancel={onClose}>
      <div class="body">
        <h2 id="export-title">Export</h2>
        {!s.ok ? (
          <>
            <p>Fix the errors under Problems before exporting:</p>
            <ul>
              {s.issues
                .filter((i) => i.severity === 'error')
                .map((i) => (
                  <li>{i.message}</li>
                ))}
            </ul>
          </>
        ) : (
          <>
            <p>
              Kerf offset grows outlines and shrinks bores by half the cutter kerf ({fmt(kerf)} mm), so cut parts come out at nominal size.
              {kerf === 0 && ' Kerf is 0 mm; set it under Fit allowances.'}
            </p>
            <label class="check">
              <input type="checkbox" checked={p.exportPrefs.kerfDxf} onChange={(e) => setPref('kerfDxf', (e.target as HTMLInputElement).checked)} />
              Offset DXF outlines for kerf (laser, waterjet)
            </label>
            <label class="check">
              <input type="checkbox" checked={p.exportPrefs.kerfStep} onChange={(e) => setPref('kerfStep', (e.target as HTMLInputElement).checked)} />
              Offset STEP solids for kerf
            </label>
            {bundle && bundle.errors.length > 0 && (
              <div class="export-errors">
                <p>Some files couldn't be made:</p>
                <ul>
                  {bundle.errors.map((e) => (
                    <li class="issue error">{e.message}</li>
                  ))}
                </ul>
              </div>
            )}
            <h2>Files</h2>
            <ul class="files">
              {bundle?.files.map((f) => (
                <li>
                  <button type="button" onClick={() => save(f)} title={describe(f.name)}>
                    {f.name}
                  </button>
                </li>
              ))}
            </ul>
            <p class="empty">
              In Fusion 360, run <strong>geartrain_params.py</strong> first (Utilities, Scripts and Add-Ins), then insert each DXF or STEP onto its shaft point.
            </p>
          </>
        )}
      </div>
      <div class="foot">
        <button type="button" onClick={() => (ref.current?.close ? ref.current.close() : onClose())}>
          Close
        </button>
        {bundle && (
          <button type="button" class="primary" onClick={() => download(`${base}.zip`, zipBundle(bundle.files), 'application/zip')}>
            Download all (.zip)
          </button>
        )}
      </div>
    </dialog>
  );
}

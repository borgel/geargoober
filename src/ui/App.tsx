import { useRef, useState } from 'preact/hooks';
import { addShaft } from '../core/edit';
import { parseGear, serializeGear } from '../core/format/gearText';
import { fromJson, toJson } from '../core/format/json';
import { newProject } from '../core/model';
import { Diagram } from './Diagram';
import { download, safeFileName } from './download';
import { ExportDialog } from './ExportDialog';
import { Guide } from './Guide';
import { HelpContext, type GuideTopic } from './help';
import { IssuesPanel } from './IssuesPanel';
import { ListEditor } from './ListEditor';
import { ProjectPanel } from './ProjectPanel';
import { ResultsPanel } from './ResultsPanel';
import { exampleProject, useProjectStore } from './state';
import { TextEditor } from './TextEditor';

export function App() {
  const store = useProjectStore();
  const { project } = store;
  const [mode, setMode] = useState<'list' | 'text'>('list');
  const [notice, setNotice] = useState<string>(store.startupNotice);
  const [exporting, setExporting] = useState(false);
  const [guide, setGuide] = useState<{ topic: GuideTopic | null } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const base = safeFileName(project.name);

  const open = async (file: File) => {
    const text = await file.text();
    const r = file.name.toLowerCase().endsWith('.json') ? fromJson(text) : parseGear(text);
    if (r.ok) {
      store.setProject(r.project);
      setMode('list');
      setNotice(`Opened ${file.name}.`);
    } else {
      setNotice(`Couldn't open ${file.name}: line ${r.errors[0].line}, ${r.errors[0].message}.`);
    }
  };

  return (
    <HelpContext.Provider value={(topic) => setGuide({ topic })}>
    <div class="app">
      <header class="toolbar">
        <div class="brand">
          <svg viewBox="-12 -12 24 24" aria-hidden="true" class="mark">
            <path d="M0-10l2 3.1 3.7-1.2.2 3.9 3.8 1-1.8 3.4 2.6 2.9-3.5 1.6.6 3.8-3.9-.3-1.6 3.5L0 9.6l-2.9 2.6-1.6-3.5-3.9.3.6-3.8-3.5-1.6 2.6-2.9-1.8-3.4 3.8-1 .2-3.9L-2-7.1z" />
            <circle r="3" />
          </svg>
          <span>GearGoober</span>
        </div>
        <h1 class="project-title">{project.name}</h1>
        <nav class="actions" aria-label="Project">
          <button
            type="button"
            onClick={() => {
              if (confirm('Start a new project? This replaces the one on screen.')) store.setProject(addShaft(newProject()));
            }}
          >
            New
          </button>
          <button type="button" onClick={() => store.setProject(exampleProject())}>
            Load example
          </button>
          <button type="button" onClick={() => fileInput.current?.click()}>
            Open…
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".gear,.json,.txt"
            hidden
            onChange={(e) => {
              const f = (e.target as HTMLInputElement).files?.[0];
              if (f) open(f);
              (e.target as HTMLInputElement).value = '';
            }}
          />
          <button type="button" onClick={() => download(`${base}.gear`, serializeGear(project), 'text/plain')}>
            Save .gear
          </button>
          <button type="button" onClick={() => download(`${base}.json`, toJson(project, store.solution), 'application/json')}>
            Save .json
          </button>
          <button type="button" aria-pressed={!!guide} onClick={() => setGuide(guide ? null : { topic: null })}>
            Gear guide
          </button>
          <button type="button" class="primary" onClick={() => setExporting(true)}>
            Export…
          </button>
        </nav>
      </header>
      {notice && (
        <p class="notice" role="status">
          {notice}
          <button type="button" class="icon" aria-label="Dismiss" onClick={() => setNotice('')}>
            ×
          </button>
        </p>
      )}
      <aside class="editor" aria-label="Editor">
        <div class="mode" role="group" aria-label="Editor mode">
          <button type="button" aria-pressed={mode === 'list'} onClick={() => setMode('list')}>
            Parts
          </button>
          <button type="button" aria-pressed={mode === 'text'} onClick={() => setMode('text')}>
            Text
          </button>
        </div>
        {mode === 'list' ? (
          <>
            <ProjectPanel store={store} />
            <ListEditor store={store} />
          </>
        ) : (
          <TextEditor store={store} />
        )}
      </aside>
      <main class="stage">
        <Diagram store={store} />
      </main>
      <section class="readout">
        <IssuesPanel store={store} />
        <ResultsPanel store={store} />
      </section>
      {exporting && <ExportDialog store={store} onClose={() => setExporting(false)} />}
      {guide && <Guide topic={guide.topic} onClose={() => setGuide(null)} />}
    </div>
    </HelpContext.Provider>
  );
}

import { useEffect, useRef, useState } from 'preact/hooks';
import { parseGear, serializeGear, type ParseError } from '../core/format/gearText';
import type { Project } from '../core/model';
import type { Store } from './state';

export function TextEditor({ store }: { store: Store }) {
  const [draft, setDraft] = useState(() => serializeGear(store.project));
  const [errors, setErrors] = useState<ParseError[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const draftRef = useRef(draft);
  const lastApplied = useRef<Project | null>(store.project);
  const setProject = useRef(store.setProject);
  setProject.current = store.setProject;

  const apply = (text: string): ParseError[] => {
    const r = parseGear(text);
    if (!r.ok) return r.errors;
    lastApplied.current = r.project;
    setProject.current(r.project);
    return [];
  };

  // The project changed somewhere else (Load example, Open, New): show it, dropping any pending parse.
  useEffect(() => {
    if (store.project === lastApplied.current) return;
    clearTimeout(timer.current);
    timer.current = undefined;
    lastApplied.current = store.project;
    const text = serializeGear(store.project);
    draftRef.current = text;
    setDraft(text);
    setErrors([]);
  }, [store.project]);

  // Leaving the editor applies an edit still waiting on the debounce.
  useEffect(
    () => () => {
      if (timer.current !== undefined) {
        clearTimeout(timer.current);
        apply(draftRef.current);
      }
    },
    [],
  );

  const onInput = (text: string) => {
    setDraft(text);
    draftRef.current = text;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = undefined;
      setErrors(apply(text));
    }, 300);
  };

  return (
    <section class="panel-section text-editor">
      <textarea aria-label="Project text" spellcheck={false} value={draft} onInput={(e) => onInput((e.target as HTMLTextAreaElement).value)} />
      <div data-testid="text-errors" class="text-errors" aria-live="polite">
        {errors.map((e) => (
          <p class="issue error">
            line {e.line}, column {e.col}: {e.message}
          </p>
        ))}
      </div>
    </section>
  );
}

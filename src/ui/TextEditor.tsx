import { useEffect, useRef, useState } from 'preact/hooks';
import { parseGear, serializeGear, type ParseError } from '../core/format/gearText';
import type { Store } from './state';

export function TextEditor({ store }: { store: Store }) {
  const [draft, setDraft] = useState(() => serializeGear(store.project));
  const [errors, setErrors] = useState<ParseError[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const onInput = (text: string) => {
    setDraft(text);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const r = parseGear(text);
      if (r.ok) {
        setErrors([]);
        store.setProject(r.project);
      } else setErrors(r.errors);
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

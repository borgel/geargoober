import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { EXAMPLE_GEAR } from '../core/example';
import { parseGear, serializeGear } from '../core/format/gearText';
import { newProject, type Project } from '../core/model';
import { solve } from '../core/solver';

export const STORAGE_KEY = 'geargoober.project';

export function exampleProject(): Project {
  const r = parseGear(EXAMPLE_GEAR);
  return r.ok ? r.project : newProject();
}

export const BACKUP_KEY = 'geargoober.project.unreadable';

function loadInitial(): { project: Project; notice: string } {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    if (text) {
      const r = parseGear(text);
      if (r.ok) return { project: r.project, notice: '' };
      // keep the unreadable text so autosave can't destroy it
      localStorage.setItem(BACKUP_KEY, text);
      return {
        project: exampleProject(),
        notice: `Your saved project couldn't be read (line ${r.errors[0].line}: ${r.errors[0].message}). It's kept in browser storage under "${BACKUP_KEY}"; showing the example instead.`,
      };
    }
  } catch {
    // storage unavailable (private mode, file:// restrictions): fall through to the example
  }
  return { project: exampleProject(), notice: '' };
}

export interface Store {
  project: Project;
  setProject: (p: Project) => void;
  update: (fn: (p: Project) => Project) => void;
  solution: ReturnType<typeof solve>;
  /** Message about how the saved project was restored, if anything went wrong. */
  startupNotice: string;
  selection: string[];
  select: (ids: string[]) => void;
}

export function useProjectStore(): Store {
  const [initial] = useState(loadInitial);
  const [project, setProject] = useState<Project>(initial.project);
  const [selection, select] = useState<string[]>([]);
  const solution = useMemo(() => solve(project), [project]);
  useEffect(() => {
    try {
      // Only autosave text that loads again; a half-typed field (blank → NaN) keeps the last good save.
      const text = serializeGear(project);
      if (parseGear(text).ok) localStorage.setItem(STORAGE_KEY, text);
    } catch {
      // ignore: autosave is best-effort
    }
  }, [project]);
  const update = useCallback((fn: (p: Project) => Project) => setProject((p) => fn(p)), []);
  return { project, setProject, update, solution, selection, select, startupNotice: initial.notice };
}

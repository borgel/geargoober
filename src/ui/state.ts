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

function loadInitial(): Project {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    if (text) {
      const r = parseGear(text);
      if (r.ok) return r.project;
    }
  } catch {
    // storage unavailable (private mode, file:// restrictions): fall through to the example
  }
  return exampleProject();
}

export interface Store {
  project: Project;
  setProject: (p: Project) => void;
  update: (fn: (p: Project) => Project) => void;
  solution: ReturnType<typeof solve>;
  selection: string[];
  select: (ids: string[]) => void;
}

export function useProjectStore(): Store {
  const [project, setProject] = useState<Project>(loadInitial);
  const [selection, select] = useState<string[]>([]);
  const solution = useMemo(() => solve(project), [project]);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, serializeGear(project));
    } catch {
      // ignore: autosave is best-effort
    }
  }, [project]);
  const update = useCallback((fn: (p: Project) => Project) => setProject((p) => fn(p)), []);
  return { project, setProject, update, solution, selection, select };
}

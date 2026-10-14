import type { Store } from './state';

export function IssuesPanel({ store }: { store: Store }) {
  const issues = [...store.solution.issues].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1));
  return (
    <section class="readout-block issues" data-testid="issues" aria-live="polite">
      <h2>Problems</h2>
      {issues.length === 0 ? (
        <p class="empty">No problems found.</p>
      ) : (
        <ul>
          {issues.map((i) => (
            <li>
              <button type="button" class={`issue ${i.severity}`} onClick={() => store.select(i.refs)}>
                <span class="badge">{i.severity === 'error' ? 'Error' : 'Warning'}</span>
                {i.message}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

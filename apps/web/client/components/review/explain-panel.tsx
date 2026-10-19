// The Explain side panel of the review: the specs explanations use, and the threads, newest first.
import type { ReactElement } from 'react';

import type { ExplanationView } from '../../../src/routes/review-explanations';
import { useExplanations } from '../../lib/use-explanations';
import { ErrorText } from '../ui';
import { useExplain, type ExplainState } from './explain-context';
import { ExplanationThread, linesLabel } from './explanation-card';

/** Each first explanation with its follow-ups, oldest first; the threads newest first. */
export function threadsOf(rows: ExplanationView[]): ExplanationView[][] {
  const oldest = rows.toSorted((a, b) => a.id - b.id);
  const threads = new Map<number, ExplanationView[]>();
  const rootOf = new Map<number, number>();
  for (const row of oldest) {
    const root = row.parentId === null ? row.id : (rootOf.get(row.parentId) ?? row.id);
    rootOf.set(row.id, root);
    threads.set(root, [...(threads.get(root) ?? []), row]);
  }
  return [...threads.values()].toReversed();
}

function statusOf(thread: ExplanationView[]): string {
  const last = thread.at(-1);
  if (last?.status === 'queued' || last?.status === 'running') {
    return ' · explaining';
  }
  return last?.outdated ? ' · outdated' : '';
}

function Body({
  explain,
  paths,
}: {
  explain: ExplainState;
  paths: ReadonlySet<string>;
}): ReactElement {
  const explanations = useExplanations(explain.target);
  const threads = threadsOf(explanations.explanations.data ?? []);
  const [newest, ...older] = threads;
  return (
    <div className="space-y-4">
      <ErrorText error={explanations.explanations.error} />
      {newest ? (
        <ExplanationThread
          thread={newest}
          explain={explain}
          explanations={explanations}
          paths={paths}
        />
      ) : (
        <p className="text-sm text-zinc-500">
          Select lines in the diff and click Explain: an agent says how they work and which parts of
          the specs and docs they relate to.
        </p>
      )}
      {older.map((thread) => (
        <details
          key={thread[0]?.id}
          className="rounded-md border border-zinc-200 p-2 dark:border-zinc-800"
        >
          <summary className="cursor-pointer truncate font-mono text-xs">
            {thread[0] ? linesLabel(thread[0]) : ''}
            {statusOf(thread)}
          </summary>
          <div className="mt-2">
            <ExplanationThread
              thread={thread}
              explain={explain}
              explanations={explanations}
              paths={paths}
            />
          </div>
        </details>
      ))}
    </div>
  );
}

/** On the right of the diff while open; `paths` are the change's files, for the citations. */
export function ExplainPanel({ paths }: { paths: ReadonlySet<string> }): ReactElement | null {
  const explain = useExplain();
  if (!explain?.open) {
    return null;
  }
  const specs = explain.specs?.map((spec) => spec.label).join(' · ');
  return (
    <aside className="w-96 shrink-0 space-y-3 overflow-y-auto border-l border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">Explain</h3>
          <p className="text-xs text-zinc-500">
            Specs: {specs === undefined ? 'reading…' : specs || 'none'} (those of Review with agent)
          </p>
        </div>
        <button
          type="button"
          aria-label="Close the Explain panel"
          className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          onClick={() => {
            explain.setOpen(false);
          }}
        >
          ✕
        </button>
      </div>
      <Body explain={explain} paths={paths} />
    </aside>
  );
}

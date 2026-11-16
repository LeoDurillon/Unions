// The Explain side panel of the review: the specs explanations use, and the conversations, the latest asked first.

import type { ReactElement } from 'react';

import type { ConversationView } from '../../../src/routes/review/explanation-views';
import { useExplanations } from '../../lib/review/use-explanations';
import { ErrorText } from '../ui/ui';
import { useExplain, type ExplainState } from './explain-context';
import { ExplanationThread } from './explanation-card';

function statusOf(conversation: ConversationView): string {
  const last = conversation.turns.at(-1);
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
  const [newest, ...older] = explanations.explanations.data ?? [];
  return (
    <div className="space-y-4">
      <ErrorText error={explanations.explanations.error} />
      {newest ? (
        <ExplanationThread
          thread={newest.turns}
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
      {older.map((conversation) => (
        <details
          key={conversation.id}
          className="rounded-md border border-zinc-200 p-2 dark:border-zinc-800"
        >
          <summary className="cursor-pointer truncate font-mono text-xs">
            {conversation.title}
            {statusOf(conversation)}
          </summary>
          <div className="mt-2">
            <ExplanationThread
              thread={conversation.turns}
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

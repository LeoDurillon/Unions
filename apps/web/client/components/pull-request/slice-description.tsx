// A lower slice's pull request description, as GitHub has it: the agent rewrites only the ticket's own.
import type { ReactElement } from 'react';

import { useDiscussion } from '../../lib/use-review';
import { FoldedMarkdown } from '../folded-markdown';
import { ErrorText } from '../ui';

function Text({ text }: { text: string }): ReactElement {
  return text === '' ? (
    <p className="text-sm text-zinc-500">No description.</p>
  ) : (
    <FoldedMarkdown>{text}</FoldedMarkdown>
  );
}

export function SliceDescription({ ticketId, pr }: { ticketId: number; pr: number }): ReactElement {
  const discussion = useDiscussion(ticketId, pr, true);
  return (
    <section className="space-y-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
      <h3 className="text-sm font-semibold">Description of #{pr}</h3>
      <ErrorText error={discussion.error} />
      {discussion.data ? <Text text={discussion.data.description.trim()} /> : null}
      <p className="text-xs text-zinc-500">
        Read from GitHub. Rewrite description works on the top pull request only.
      </p>
    </section>
  );
}

// A pull request's description as GitHub has it now, folded when long: the same for the ticket's PR and each slice's.
import type { ReactElement } from 'react';

import { useDiscussion } from '../../lib/use-review';
import { FoldedMarkdown } from '../folded-markdown';
import { ErrorText } from '../ui';

export function GitHubDescription({
  ticketId,
  pr,
}: {
  ticketId: number;
  pr: number;
}): ReactElement {
  const discussion = useDiscussion(ticketId, pr, true);
  if (!discussion.data) {
    return <ErrorText error={discussion.error} />;
  }
  const text = discussion.data.description.trim();
  return text === '' ? (
    <p className="text-sm text-zinc-500">No description on GitHub.</p>
  ) : (
    <FoldedMarkdown>{text}</FoldedMarkdown>
  );
}

// A pull request's description as GitHub has it now, folded when long: the same for the ticket's PR and each slice's.

import type { ReactElement } from 'react';

import { useDiscussion } from '../../lib/review/use-review';
import { FoldedMarkdown } from '../markdown/folded-markdown';
import { Loading, SkeletonLines } from '../ui/skeleton';
import { ErrorText } from '../ui/ui';

export function GitHubDescription({
  ticketId,
  pr,
}: {
  ticketId: number;
  pr: number;
}): ReactElement {
  const discussion = useDiscussion(ticketId, pr, true);
  if (!discussion.data) {
    return discussion.error ? (
      <ErrorText error={discussion.error} />
    ) : (
      <Loading label="Reading the description">
        <SkeletonLines />
      </Loading>
    );
  }
  const text = discussion.data.description.trim();
  return text === '' ? (
    <p className="text-sm text-zinc-500">No description on GitHub.</p>
  ) : (
    <FoldedMarkdown>{text}</FoldedMarkdown>
  );
}

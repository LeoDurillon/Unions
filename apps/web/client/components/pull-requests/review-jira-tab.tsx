// A review's Jira tab: each linked issue's fields (editable), description, then its comments (read only), Refresh.

import type { ReactElement } from 'react';

import type { CurrentReview } from '../../../src/api-types';
import type { ReviewJiraIssue } from '../../../src/review-jira-types';
import { reviewJiraKey, useReviewJiraIssues } from '../../lib/review/use-review-jira';
import { FoldedMarkdown } from '../markdown/folded-markdown';
import { TrackerThreadCard } from '../tracker/tracker-thread';
import { Button, ErrorText } from '../ui/ui';
import { ReviewTrackerItem } from './review-tracker-item';

/** The issue's comments, read only: replying and Add to review are a ticket's. */
function IssueComments({ issue }: { issue: ReviewJiraIssue }): ReactElement | null {
  const { threads } = issue;
  if ('error' in threads) {
    return <p className="text-xs text-amber-700 dark:text-amber-400">{threads.error}</p>;
  }
  if (threads.threads.length === 0) {
    return null;
  }
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">
        Comments ({threads.threads.length})
      </h4>
      {threads.threads.map((thread) => (
        <TrackerThreadCard key={thread.id} kind="jira" thread={thread} />
      ))}
    </div>
  );
}

function IssueText({
  review,
  issue,
}: {
  review: CurrentReview;
  issue: ReviewJiraIssue;
}): ReactElement {
  return (
    <section className="space-y-2" aria-label={issue.key}>
      <h3 className="text-sm font-semibold">
        <a
          href={issue.url}
          target="_blank"
          rel="noreferrer"
          className="hover:underline"
          title="Open in Jira"
        >
          {issue.key} {issue.summary}
        </a>
      </h3>
      <ReviewTrackerItem
        review={review}
        item={{ kind: 'jira', itemId: issue.key, ...issue }}
        queryKey={reviewJiraKey(review)}
      >
        {issue.markdown === '' ? (
          <p className="text-sm text-zinc-500">No description.</p>
        ) : (
          <FoldedMarkdown>{issue.markdown}</FoldedMarkdown>
        )}
        <IssueComments issue={issue} />
      </ReviewTrackerItem>
    </section>
  );
}

export function ReviewJiraTab({ review }: { review: CurrentReview }): ReactElement {
  const issues = useReviewJiraIssues(review);
  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button
          disabled={issues.isFetching}
          onClick={() => {
            void issues.refetch();
          }}
        >
          {issues.isFetching ? 'Reading…' : 'Refresh'}
        </Button>
      </div>
      <ErrorText error={issues.error} />
      {!issues.data && issues.isFetching ? (
        <p className="text-sm text-zinc-500">Reading the issues on Jira…</p>
      ) : null}
      {issues.data?.map((issue) => (
        <IssueText key={issue.key} review={review} issue={issue} />
      ))}
    </div>
  );
}

// A review's Jira tab: each linked issue's description as Jira has it now, then its comments (read only), with Refresh.
import type { ReactElement } from 'react';

import type { CurrentReview } from '../../../src/api-types';
import type { ReviewJiraIssue } from '../../../src/review-jira-types';
import { useReviewJiraIssues } from '../../lib/use-review-jira';
import { FoldedMarkdown } from '../folded-markdown';
import { JiraCommentCard } from '../jira/jira-comment';
import { Button, ErrorText } from '../ui';

/** The issue's comments, read only: replying and Add to review are a ticket's. */
function IssueComments({ issue }: { issue: ReviewJiraIssue }): ReactElement | null {
  const { comments } = issue;
  if ('error' in comments) {
    return <p className="text-xs text-amber-700 dark:text-amber-400">{comments.error}</p>;
  }
  if (comments.length === 0) {
    return null;
  }
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">
        Comments ({comments.length})
      </h4>
      {comments.map((comment) => (
        <JiraCommentCard key={comment.id} comment={comment} />
      ))}
    </div>
  );
}

function IssueText({ issue }: { issue: ReviewJiraIssue }): ReactElement {
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
      {issue.markdown === '' ? (
        <p className="text-sm text-zinc-500">No description.</p>
      ) : (
        <FoldedMarkdown>{issue.markdown}</FoldedMarkdown>
      )}
      <IssueComments issue={issue} />
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
        <IssueText key={issue.key} issue={issue} />
      ))}
    </div>
  );
}

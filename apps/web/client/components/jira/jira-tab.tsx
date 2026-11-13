// A ticket's Jira tab: the issue's card, then its comments, read once per opening. With Reply on
// each and New comment, which the worker posts.

import type { ReactElement } from 'react';

import { useJiraComments, useJiraCommentSend } from '../../lib/integrations/use-jira-comments';
import { useJiraReviewImport } from '../../lib/integrations/use-jira-review-import';
import { Loading, SkeletonList } from '../ui/skeleton';
import { CARD_CLASS, ErrorText } from '../ui/ui';
import { JiraComments } from './jira-comment-list';
import { JiraIssueCard } from './jira-issue-card';

export function JiraTab({ ticket }: { ticket: { id: number; projectId: number } }): ReactElement {
  const ticketId = ticket.id;
  const comments = useJiraComments(ticketId);
  const sender = useJiraCommentSend(ticketId);
  const reviewImport = useJiraReviewImport(ticketId);
  const { data } = comments;
  return (
    <div className="space-y-4">
      <JiraIssueCard
        ticket={ticket}
        pendingFields={data?.pendingFields ?? []}
        issue={data ? { key: data.key, url: data.issueUrl, facts: data.issue } : null}
        loaded={data !== undefined || comments.error !== null}
        reading={comments.isFetching}
        onRefresh={() => {
          void comments.refetch();
        }}
      >
        <ErrorText error={comments.error ?? reviewImport.error} />
        {!data && comments.isFetching ? (
          <section className={CARD_CLASS}>
            <Loading label="Reading the comments" reason="Reading the issue from Jira">
              <SkeletonList count={2} lines={2} />
            </Loading>
          </section>
        ) : null}
        {data ? <JiraComments view={data} sender={sender} reviewImport={reviewImport} /> : null}
      </JiraIssueCard>
    </div>
  );
}

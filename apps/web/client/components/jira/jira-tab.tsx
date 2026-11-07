// A ticket's Jira tab: the comments of the issue it was imported from, read once per opening, with Refresh.
import type { ReactElement } from 'react';

import type { JiraTabView } from '../../../src/jira-comment-types';
import { useJiraComments } from '../../lib/use-jira-comments';
import { Button, ErrorText } from '../ui';
import { JiraCommentCard } from './jira-comment';

function Comments({ view }: { view: JiraTabView }): ReactElement {
  const left = view.total - view.comments.length;
  return (
    <>
      {left > 0 ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          The issue has {view.total} comments:{' '}
          {left === 1 ? 'the oldest is not shown' : `the ${left} oldest are not shown`}. Open the
          issue in Jira for it.
        </p>
      ) : null}
      {view.comments.length === 0 ? (
        <p className="text-sm text-zinc-500">No comments on the issue.</p>
      ) : (
        view.comments.map((comment) => <JiraCommentCard key={comment.id} comment={comment} />)
      )}
    </>
  );
}

export function JiraTab({ ticketId }: { ticketId: number }): ReactElement {
  const comments = useJiraComments(ticketId);
  const { data } = comments;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {data ? (
          <a
            href={data.issueUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-zinc-500 hover:underline"
          >
            Open {data.key} in Jira
          </a>
        ) : null}
        <Button
          className="ml-auto"
          disabled={comments.isFetching}
          onClick={() => {
            void comments.refetch();
          }}
        >
          {comments.isFetching ? 'Reading…' : 'Refresh'}
        </Button>
      </div>
      <ErrorText error={comments.error} />
      {!data && comments.isFetching ? (
        <p className="text-sm text-zinc-500">Reading the comments on Jira…</p>
      ) : null}
      {data ? <Comments view={data} /> : null}
    </div>
  );
}

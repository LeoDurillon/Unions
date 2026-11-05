// A ticket's Notion tab: the open discussions of its page, read once per opening, with Refresh.
import type { ReactElement } from 'react';

import type { NotionDiscussionsView } from '../../../src/notion-discussion-types';
import { useNotionComments } from '../../lib/use-notion-comments';
import { Button, ErrorText } from '../ui';
import { NotionDiscussion } from './notion-discussion';

function Discussions({ view }: { view: NotionDiscussionsView }): ReactElement {
  return (
    <>
      {view.truncated ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          The page has many commented passages: only the first ones were read. Open the page in
          Notion for the rest.
        </p>
      ) : null}
      {view.discussions.length === 0 ? (
        <p className="text-sm text-zinc-500">No open comments on the page.</p>
      ) : (
        view.discussions.map((discussion) => (
          <NotionDiscussion key={discussion.id} discussion={discussion} />
        ))
      )}
    </>
  );
}

export function NotionTab({ ticketId }: { ticketId: number }): ReactElement {
  const comments = useNotionComments(ticketId);
  const { data } = comments;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {data ? (
          <a
            href={data.pageUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-zinc-500 hover:underline"
          >
            Open the page in Notion
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
        <p className="text-sm text-zinc-500">Reading the comments on Notion…</p>
      ) : null}
      {data ? <Discussions view={data} /> : null}
    </div>
  );
}

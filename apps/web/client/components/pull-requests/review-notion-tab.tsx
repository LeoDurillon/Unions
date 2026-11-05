// A review's Notion tab: each linked page's text as Notion has it now, folded when long, then its open discussions (read only), with Refresh.
import type { ReactElement } from 'react';

import type { CurrentReview } from '../../../src/api-types';
import type { ReviewNotionPage } from '../../../src/review-notion-types';
import { useReviewNotionPages } from '../../lib/use-review-notion';
import { FoldedMarkdown } from '../folded-markdown';
import { NotionDiscussion } from '../notion/notion-discussion';
import { Button, ErrorText } from '../ui';

/** The page's open discussions, read only: replying and Add to review are a ticket's. */
function PageDiscussions({ page }: { page: ReviewNotionPage }): ReactElement | null {
  const { discussions } = page;
  if ('error' in discussions) {
    return <p className="text-xs text-amber-700 dark:text-amber-400">{discussions.error}</p>;
  }
  if (discussions.discussions.length === 0) {
    return null;
  }
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">
        Open discussions ({discussions.discussions.length})
      </h4>
      {discussions.truncated ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          The page has many commented passages: only the first ones were read.
        </p>
      ) : null}
      {discussions.discussions.map((discussion) => (
        <NotionDiscussion key={discussion.id} discussion={discussion} />
      ))}
    </div>
  );
}

function PageText({ page }: { page: ReviewNotionPage }): ReactElement {
  return (
    <section className="space-y-2" aria-label={page.title}>
      <h3 className="text-sm font-semibold">
        <a
          href={page.url}
          target="_blank"
          rel="noreferrer"
          className="hover:underline"
          title="Open in Notion"
        >
          {page.title}
        </a>
      </h3>
      {page.truncated ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          The page is very long: Notion returned only its first part.
        </p>
      ) : null}
      {page.markdown === '' ? (
        <p className="text-sm text-zinc-500">Empty page.</p>
      ) : (
        <FoldedMarkdown>{page.markdown}</FoldedMarkdown>
      )}
      <PageDiscussions page={page} />
    </section>
  );
}

export function ReviewNotionTab({ review }: { review: CurrentReview }): ReactElement {
  const pages = useReviewNotionPages(review);
  const { data } = pages;
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-2">
        <Button
          disabled={pages.isFetching}
          onClick={() => {
            void pages.refetch();
          }}
        >
          {pages.isFetching ? 'Reading…' : 'Refresh'}
        </Button>
      </div>
      <ErrorText error={pages.error} />
      {!data && pages.isFetching ? (
        <p className="text-sm text-zinc-500">Reading the pages on Notion…</p>
      ) : null}
      {(data ?? []).map((page) => (
        <PageText key={page.pageId} page={page} />
      ))}
    </div>
  );
}

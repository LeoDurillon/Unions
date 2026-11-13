// A review's Notion tab: each linked page's properties (editable), text as Notion has it now, and discussions.
// Long text is folded; the discussions are read only; the tab has Refresh.

import type { ReactElement } from 'react';

import type { CurrentReview } from '../../../src/api-types';
import type { ReviewNotionPage } from '../../../src/review-notion-types';
import { reviewNotionKey, useReviewNotionPages } from '../../lib/review/use-review-notion';
import { FoldedMarkdown } from '../markdown/folded-markdown';
import { NotionDiscussion } from '../notion/notion-discussion';
import { Button, ErrorText } from '../ui/ui';
import { ReviewItemProperties } from './review-item-properties';

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

function PageText({
  review,
  page,
}: {
  review: CurrentReview;
  page: ReviewNotionPage;
}): ReactElement {
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
      <ReviewItemProperties
        review={review}
        item={{ kind: 'notion', itemId: page.pageId, ...page }}
        queryKey={reviewNotionKey(review)}
      />
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
        <PageText key={page.pageId} review={review} page={page} />
      ))}
    </div>
  );
}

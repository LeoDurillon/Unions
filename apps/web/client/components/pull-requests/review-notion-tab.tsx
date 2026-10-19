// A review's Notion tab: the linked page's text as Notion has it now, folded when long, with Refresh.
import type { ReactElement } from 'react';

import type { CurrentReview } from '../../../src/api-types';
import { useReviewNotionPage } from '../../lib/use-review-notion';
import { FoldedMarkdown } from '../folded-markdown';
import { Button, ErrorText } from '../ui';

export function ReviewNotionTab({ review }: { review: CurrentReview }): ReactElement {
  const page = useReviewNotionPage(review);
  const { data } = page;
  return (
    <section className="space-y-3" aria-label="Notion page text">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">
          {data ? (
            <a
              href={data.url}
              target="_blank"
              rel="noreferrer"
              className="hover:underline"
              title="Open in Notion"
            >
              {data.title}
            </a>
          ) : (
            (review.notionTitle ?? 'Notion page')
          )}
        </h3>
        <Button
          disabled={page.isFetching}
          onClick={() => {
            void page.refetch();
          }}
        >
          {page.isFetching ? 'Reading…' : 'Refresh'}
        </Button>
      </div>
      <ErrorText error={page.error} />
      {!data && page.isFetching ? (
        <p className="text-sm text-zinc-500">Reading the page on Notion…</p>
      ) : null}
      {data?.truncated ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          The page is very long: Notion returned only its first part.
        </p>
      ) : null}
      {data && data.markdown === '' ? <p className="text-sm text-zinc-500">Empty page.</p> : null}
      {data && data.markdown !== '' ? <FoldedMarkdown>{data.markdown}</FoldedMarkdown> : null}
    </section>
  );
}

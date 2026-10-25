// The Notion pages of a review's Description tab: link one or more (each title checked first),
// unlink one.
import { useState, type ReactElement } from 'react';

import type { CurrentReview } from '../../../src/api-types';
import { useReviewNotionLink } from '../../lib/use-review-notion';
import { NotionLinkForm, NotionPageLink } from '../notion-link-form';
import { Button, ErrorText } from '../ui';
import { LinkStackButton, NotionSuggestions } from './review-notion-offers';

type LinkActions = ReturnType<typeof useReviewNotionLink>;

/** One linked page: its title (a link to Notion), Unlink, and the stack offer. */
function LinkedPage({
  review,
  page,
  actions,
}: {
  review: CurrentReview;
  page: CurrentReview['notionPages'][number];
  actions: LinkActions;
}): ReactElement {
  return (
    <li className="flex flex-wrap items-center gap-2 text-sm">
      {page.url ? <NotionPageLink title={page.title} url={page.url} /> : <span>{page.title}</span>}
      <Button
        variant="ghost"
        disabled={actions.unlink.isPending}
        onClick={() => {
          actions.unlink.mutate(page.id);
        }}
      >
        Unlink
      </Button>
      <LinkStackButton review={review} pageId={page.id} actions={actions} />
    </li>
  );
}

/**
 * The linked pages, each with Unlink; Link another page (or, with none, the field at once) with the
 * description's suggestions. Each page is one of the review's specs.
 */
export function ReviewNotionLinkRow({ review }: { review: CurrentReview }): ReactElement {
  const actions = useReviewNotionLink(review);
  const [adding, setAdding] = useState(false);
  const pages = review.notionPages;
  const done = (): void => {
    setAdding(false);
    actions.check.reset();
  };
  return (
    <section className="space-y-2" aria-label="Notion pages">
      <h3 className="text-sm font-semibold">Notion pages</h3>
      {pages.length > 0 ? (
        <ul className="space-y-1">
          {pages.map((page) => (
            <LinkedPage key={page.id} review={review} page={page} actions={actions} />
          ))}
        </ul>
      ) : null}
      <ErrorText error={actions.unlink.error ?? actions.link.error} />
      {pages.length > 0 && !adding ? (
        <Button
          onClick={() => {
            setAdding(true);
          }}
        >
          Link another page
        </Button>
      ) : (
        <>
          <NotionSuggestions review={review} actions={actions} onDone={done} />
          <NotionLinkForm
            check={actions.check}
            linking={actions.link.isPending}
            linkError={actions.link.error}
            onLink={(page) => {
              actions.link.mutate({ page }, { onSuccess: done });
            }}
            onCancel={pages.length > 0 ? done : null}
          />
        </>
      )}
    </section>
  );
}

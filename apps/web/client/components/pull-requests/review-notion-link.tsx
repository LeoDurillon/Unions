// The Notion pages of a review's Description tab: link one or more (each title checked first),
// unlink one.
import { useState, type ReactElement } from 'react';

import type { CurrentReview } from '../../../src/api-types';
import { useReviewNotionLink } from '../../lib/use-review-notion';
import { Button, ErrorText, inputClass } from '../ui';
import { LinkStackButton, NotionSuggestions } from './review-notion-offers';

type LinkActions = ReturnType<typeof useReviewNotionLink>;

function PageLink({ title, url }: { title: string; url: string }): ReactElement {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
    >
      {title}
    </a>
  );
}

/** A URL field; the page it names is read (its title shown) before it is linked. */
function LinkForm({
  actions,
  onDone,
  onCancel,
}: {
  actions: LinkActions;
  onDone: () => void;
  onCancel: (() => void) | null;
}): ReactElement {
  const [page, setPage] = useState('');
  const { check, link } = actions;
  const found = check.data;
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          className={`${inputClass} font-mono`}
          aria-label="Notion page URL"
          placeholder="Link a Notion page: its URL or ID"
          value={page}
          onChange={(event) => {
            setPage(event.target.value);
            check.reset();
          }}
        />
        <Button
          disabled={page.trim() === '' || check.isPending}
          onClick={() => {
            check.mutate(page.trim());
          }}
        >
          {check.isPending ? 'Reading…' : 'Check'}
        </Button>
        {onCancel ? <Button onClick={onCancel}>Cancel</Button> : null}
      </div>
      {found ? (
        <div className="flex items-center gap-2 text-sm">
          <span>
            Link <PageLink title={found.title} url={found.url} />?
          </span>
          <Button
            variant="primary"
            disabled={link.isPending}
            onClick={() => {
              link.mutate({ page: found.pageId }, { onSuccess: onDone });
            }}
          >
            {link.isPending ? 'Linking…' : 'Link'}
          </Button>
        </div>
      ) : null}
      <ErrorText error={check.error ?? link.error} />
    </div>
  );
}

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
      {page.url ? <PageLink title={page.title} url={page.url} /> : <span>{page.title}</span>}
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
          <LinkForm actions={actions} onDone={done} onCancel={pages.length > 0 ? done : null} />
        </>
      )}
    </section>
  );
}

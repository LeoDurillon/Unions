// The Notion page row of a review's Description tab: link a page (its title checked first), change or unlink it.
import { useState, type ReactElement } from 'react';

import type { CurrentReview } from '../../../src/api-types';
import { useReviewNotionLink } from '../../lib/use-review-notion';
import { Button, ErrorText, inputClass } from '../ui';

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
              link.mutate(found.pageId, { onSuccess: onDone });
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

/** Linked: the page's title (a link to Notion), Change and Unlink; otherwise the field to link one. */
export function ReviewNotionLinkRow({ review }: { review: CurrentReview }): ReactElement {
  const actions = useReviewNotionLink(review);
  const [changing, setChanging] = useState(false);
  const { notionTitle, notionUrl } = review;
  const linked = notionTitle !== null && notionUrl !== null;
  const done = (): void => {
    setChanging(false);
    actions.check.reset();
  };
  return (
    <section className="space-y-2" aria-label="Notion page">
      <h3 className="text-sm font-semibold">Notion page</h3>
      {linked && !changing ? (
        <div className="flex items-center gap-2 text-sm">
          <PageLink title={notionTitle} url={notionUrl} />
          <Button
            onClick={() => {
              setChanging(true);
            }}
          >
            Change
          </Button>
          <Button
            disabled={actions.unlink.isPending}
            onClick={() => {
              actions.unlink.mutate();
            }}
          >
            Unlink
          </Button>
          <ErrorText error={actions.unlink.error} />
        </div>
      ) : (
        <LinkForm actions={actions} onDone={done} onCancel={linked ? done : null} />
      )}
    </section>
  );
}

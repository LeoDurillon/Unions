// A Notion URL field: the page it names is read (its title shown) before it is linked.
import type { UseMutationResult } from '@tanstack/react-query';
import { useState, type ReactElement } from 'react';

import type { ReviewNotionLink } from '../../src/review-notion-types';
import { Button, ErrorText, inputClass } from './ui';

export function NotionPageLink({ title, url }: { title: string; url: string }): ReactElement {
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

/** A URL field; the page it names is read (its title shown) before `onLink` links it. */
export function NotionLinkForm({
  check,
  linking,
  linkError,
  onLink,
  onCancel,
}: {
  check: UseMutationResult<ReviewNotionLink, Error, string>;
  linking: boolean;
  linkError: Error | null;
  onLink: (pageId: string) => void;
  onCancel: (() => void) | null;
}): ReactElement {
  const [page, setPage] = useState('');
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
            Link <NotionPageLink title={found.title} url={found.url} />?
          </span>
          <Button
            variant="primary"
            disabled={linking}
            onClick={() => {
              onLink(found.pageId);
            }}
          >
            {linking ? 'Linking…' : 'Link'}
          </Button>
        </div>
      ) : null}
      <ErrorText error={check.error ?? linkError} />
    </div>
  );
}

// A Notion URL field: the page it names is read (its title shown) before it is linked.
import type { UseMutationResult } from '@tanstack/react-query';
import type { ReactElement } from 'react';

import type { ReviewNotionLink } from '../../src/review-notion-types';
import { ItemLink, TrackerLinkForm } from './tracker-link-form';

export function NotionPageLink({ title, url }: { title: string; url: string }): ReactElement {
  return <ItemLink title={title} url={url} />;
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
  const page = check.data;
  return (
    <TrackerLinkForm
      label="Notion page URL"
      placeholder="Link a Notion page: its URL or ID"
      check={check}
      found={page ? { ref: page.pageId, title: page.title, url: page.url } : null}
      linking={linking}
      linkError={linkError}
      onLink={onLink}
      onCancel={onCancel}
    />
  );
}

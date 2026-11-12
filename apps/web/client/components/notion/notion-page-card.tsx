// The Notion tab's page card: the page's title, its status column's value and its last edit, Open in Notion, Refresh.

import type { ReactElement } from 'react';

import type { NotionPageFacts } from '../../../src/notion-discussion-types';
import { timeAgo } from '../../lib/ui/relative-time';
import { useNow } from '../../lib/ui/use-now';
import { Bone } from '../ui/skeleton';
import { Button, CARD_CLASS } from '../ui/ui';

/** `status In review · edited 2 h ago`, or what Notion did not give left out. */
function PageFacts({ facts }: { facts: NotionPageFacts }): ReactElement {
  const now = useNow(false);
  return (
    <p className="truncate text-xs text-zinc-500">
      Notion page
      {facts.status ? (
        <>
          {' · '}
          {facts.status.name}{' '}
          <strong className="font-semibold text-zinc-800 dark:text-zinc-200">
            {facts.status.value}
          </strong>
        </>
      ) : null}
      {facts.editedAt ? ` · edited ${timeAgo(Date.parse(facts.editedAt), now)}` : ''}
    </p>
  );
}

/** Before Notion answered: shapes; a page it could not read: what the tab still shows. */
function Heading({
  facts,
  loaded,
}: {
  facts: NotionPageFacts | null;
  loaded: boolean;
}): ReactElement {
  if (!loaded) {
    return (
      <div className="space-y-1.5">
        <Bone className="h-3.5" width="45%" />
        <Bone className="h-2.5" width="30%" />
      </div>
    );
  }
  if (facts === null) {
    return (
      <>
        <p className="text-sm font-semibold">Notion page</p>
        <p className="text-xs text-zinc-500">Its open discussions, read when the tab opens.</p>
      </>
    );
  }
  return (
    <>
      <p className="truncate text-sm font-semibold" title={facts.title}>
        {facts.title || 'Untitled page'}
      </p>
      <PageFacts facts={facts} />
    </>
  );
}

export function NotionPageCard({
  facts,
  loaded,
  pageUrl,
  reading,
  onRefresh,
}: {
  facts: NotionPageFacts | null;
  /** Notion answered (the page read or not). */
  loaded: boolean;
  pageUrl: string | null;
  reading: boolean;
  onRefresh: () => void;
}): ReactElement {
  return (
    <div className={`${CARD_CLASS} flex items-center gap-3 space-y-0`}>
      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 font-semibold dark:border-zinc-700 dark:bg-zinc-800"
      >
        N
      </span>
      <div className="min-w-0 flex-1">
        <Heading facts={facts} loaded={loaded} />
      </div>
      {pageUrl ? (
        <a
          href={pageUrl}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 text-sm text-indigo-600 hover:underline dark:text-indigo-400"
        >
          Open in Notion ↗
        </a>
      ) : null}
      <Button className="shrink-0" disabled={reading} onClick={onRefresh}>
        {reading ? 'Reading…' : 'Refresh'}
      </Button>
    </div>
  );
}

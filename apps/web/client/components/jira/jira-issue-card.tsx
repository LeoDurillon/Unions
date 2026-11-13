// The Jira tab's issue card: its summary, key, type, status, assignee and last update, Open in Jira, Refresh.

import type { JiraIssueFacts } from '@union/core';
import type { ReactElement } from 'react';

import type { Tone } from '../../lib/board/labels';
import { timeAgo } from '../../lib/ui/relative-time';
import { useNow } from '../../lib/ui/use-now';
import { TrackerItemCard } from '../tracker/tracker-item-card';
import { Badge } from '../ui/ui';

const CATEGORY_TONES: Record<
  NonNullable<NonNullable<JiraIssueFacts['status']>['category']>,
  Tone
> = {
  new: 'neutral',
  indeterminate: 'blue',
  done: 'green',
};

/** `ABC-1 · Story · In Review · Ada Lovelace · updated 2 h ago`, what Jira did not give left out. */
function IssueFacts({
  issueKey,
  facts,
}: {
  issueKey: string;
  facts: JiraIssueFacts;
}): ReactElement {
  const now = useNow(false);
  const { status } = facts;
  return (
    <p className="flex min-w-0 items-center gap-1.5 text-xs whitespace-nowrap text-zinc-500">
      <span className="font-medium text-zinc-700 dark:text-zinc-300">{issueKey}</span>
      {facts.type ? <span>· {facts.type}</span> : null}
      {status ? (
        <Badge tone={status.category ? CATEGORY_TONES[status.category] : 'neutral'}>
          {status.name}
        </Badge>
      ) : null}
      <span className="truncate">
        {facts.assignee ?? 'Unassigned'}
        {facts.updatedAt ? ` · updated ${timeAgo(Date.parse(facts.updatedAt), now)}` : ''}
      </span>
    </p>
  );
}

/** An issue Jira did not give: what the tab still shows. */
function Heading({
  issueKey,
  facts,
}: {
  issueKey: string | null;
  facts: JiraIssueFacts | null;
}): ReactElement {
  if (facts === null || issueKey === null) {
    return (
      <>
        <p className="text-sm font-semibold">{issueKey ?? 'Jira issue'}</p>
        <p className="text-xs text-zinc-500">Its comments, read when the tab opens.</p>
      </>
    );
  }
  return (
    <>
      <p className="truncate text-sm font-semibold" title={facts.summary}>
        {facts.summary || issueKey}
      </p>
      <IssueFacts issueKey={issueKey} facts={facts} />
    </>
  );
}

export function JiraIssueCard({
  issue,
  loaded,
  reading,
  onRefresh,
}: {
  /** The issue's key and address, and its facts (null when Jira did not give them). */
  issue: { key: string; url: string; facts: JiraIssueFacts | null } | null;
  /** Jira answered (the issue read or not). */
  loaded: boolean;
  reading: boolean;
  onRefresh: () => void;
}): ReactElement {
  return (
    <TrackerItemCard
      mark="J"
      loaded={loaded}
      open={issue ? { url: issue.url, label: 'Open in Jira' } : null}
      reading={reading}
      onRefresh={onRefresh}
      properties={issue?.facts?.properties ?? []}
    >
      <Heading issueKey={issue?.key ?? null} facts={issue?.facts ?? null} />
    </TrackerItemCard>
  );
}

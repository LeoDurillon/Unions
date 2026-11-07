// One comment of a ticket's Jira issue: who wrote it and when, who may see it, its text, and where it is in Jira.
import type { JiraComment } from '@union/core';
import type { ReactElement } from 'react';

import { Markdown } from '../markdown';
import { Badge } from '../ui';

const CARD =
  'space-y-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900';

export function JiraCommentCard({ comment }: { comment: JiraComment }): ReactElement {
  return (
    <article className={CARD}>
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-medium">{comment.author}</span>
        <span className="text-xs text-zinc-500">
          {new Date(comment.created).toLocaleString()}
          {comment.edited ? ' · edited' : ''}
        </span>
        {comment.restriction === null ? null : <Badge tone="amber">{comment.restriction}</Badge>}
        <a
          href={comment.url}
          target="_blank"
          rel="noreferrer"
          className="ml-auto text-xs text-zinc-500 hover:underline"
        >
          Open in Jira
        </a>
      </div>
      <Markdown compact>{comment.markdown === '' ? '*(empty)*' : comment.markdown}</Markdown>
    </article>
  );
}

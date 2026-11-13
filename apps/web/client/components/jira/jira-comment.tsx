// One comment of a ticket's Jira issue: who wrote it and when, who may see it, and its text. Also
// where it is in Jira, and what can be done with it (Add to review, Reply).

import type { JiraComment } from '@union/core';
import type { ReactElement, ReactNode } from 'react';

import { formatWhen } from '../../lib/ui/relative-time';
import { Markdown } from '../markdown/markdown';
import { Badge, CARD_CLASS } from '../ui/ui';

const CARD = `${CARD_CLASS} text-sm`;

export function JiraCommentCard({
  comment,
  action,
  children,
}: {
  comment: JiraComment;
  /** Beside the author: Add to review. */
  action?: ReactNode;
  /** Under the text: Reply, what is being sent in answer. */
  children?: ReactNode;
}): ReactElement {
  return (
    <article className={CARD}>
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-medium">{comment.author}</span>
        <span className="text-xs text-zinc-500">
          {formatWhen(comment.created)}
          {comment.edited ? ' · edited' : ''}
        </span>
        {comment.restriction === null ? null : <Badge tone="amber">{comment.restriction}</Badge>}
        {action}
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
      {children}
    </article>
  );
}

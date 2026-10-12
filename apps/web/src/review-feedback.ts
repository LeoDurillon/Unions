import type { ReviewComment } from '@union/core';

type Draft = Pick<
  ReviewComment,
  'kind' | 'path' | 'side' | 'startLine' | 'endLine' | 'excerpt' | 'body'
>;

function lines(comment: Draft): string {
  const range =
    comment.startLine === comment.endLine
      ? `Line ${comment.startLine}`
      : `Lines ${comment.startLine}-${comment.endLine}`;
  return comment.side === 'old' ? `${range} (removed code)` : range;
}

/**
 * The review as the implementer receives it: overall note, the comments on the whole pull request,
 * then each line comment under its file.
 */
export function formatReview(comments: readonly Draft[], summary: string): string {
  const parts = ['# Code review from the user'];
  if (summary.trim() !== '') {
    parts.push(summary.trim());
  }
  const general = comments.filter((comment) => comment.kind === 'general');
  if (general.length > 0) {
    parts.push('## On the pull request', ...general.map((comment) => comment.body.trim()));
  }
  const onLines = comments.filter((comment) => comment.kind === 'line');
  const paths = [...new Set(onLines.map((comment) => comment.path))];
  for (const path of paths) {
    parts.push(`## ${path}`);
    for (const comment of onLines.filter((candidate) => candidate.path === path)) {
      parts.push(
        `**${lines(comment)}**\n\n\`\`\`\n${comment.excerpt}\n\`\`\`\n\n${comment.body.trim()}`,
      );
    }
  }
  return parts.join('\n\n');
}

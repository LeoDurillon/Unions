// The top of a review page: its header, then the review's specs.
import type { ComponentProps, ReactElement } from 'react';

import type { CommentView } from '../../../src/api-types';
import { hasPullRequest } from '../../lib/review-target';
import { ReviewHeader } from './review-header';
import { SpecsBar } from './specs-bar';

type HeaderProps = ComponentProps<typeof ReviewHeader>;

/** The header's counts: every draft of the review, and the agent's not kept yet. */
function draftCounts(comments: CommentView[]): { drafts: number; suggestions: number } {
  const drafts = comments.filter((comment) => comment.status === 'draft');
  return {
    drafts: drafts.length,
    suggestions: drafts.filter((comment) => comment.author === 'agent').length,
  };
}

/** `comments` are all the review's, for the header's draft counts. */
export function ReviewTop({
  comments,
  ...props
}: Omit<HeaderProps, 'drafts' | 'suggestions'> & { comments: CommentView[] }): ReactElement {
  return (
    <>
      <ReviewHeader {...props} {...draftCounts(comments)} />
      <SpecsBar target={props.target} hasPullRequest={hasPullRequest(props.target, props.diff)} />
    </>
  );
}

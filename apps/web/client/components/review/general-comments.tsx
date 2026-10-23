// Drafts about the whole change rather than lines of a file: the agent's overall remark, and its
// findings outside the diff.
import type { ReactElement } from 'react';

import type { CommentView } from '../../../src/api-types';
import type { useCommentMutations } from '../../lib/use-review';
import { ReviewCommentCard } from './comment-card';

type Mutations = ReturnType<typeof useCommentMutations>;

/**
 * Drafts about the whole change rather than lines of a file: the agent's overall remark, and its
 * findings outside the diff. Sent ones are not repeated here.
 */
export function GeneralComments({
  comments,
  mutations,
}: {
  comments: CommentView[];
  mutations: Mutations;
}): ReactElement | null {
  const drafts = comments.filter(
    (comment) => comment.kind === 'general' && comment.status === 'draft',
  );
  if (drafts.length === 0) {
    return null;
  }
  return (
    <section aria-label="Comments on the whole change" className="mb-4 space-y-2">
      <h3 className="text-sm font-semibold">On the whole change</h3>
      {drafts.map((comment) => (
        <ReviewCommentCard key={comment.id} comment={comment} mutations={mutations} />
      ))}
    </section>
  );
}

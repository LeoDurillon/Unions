// Add to review on a tracker's comment (a Notion discussion, a Jira comment): a draft of the ticket's review, or why not.
import type { ReactElement } from 'react';

import { Badge, Button } from '../ui';

/** Whether the comment is in the ticket's review, why it cannot be added, and adding it. */
export type ReviewImportState = {
  imported: boolean;
  refusal: string | null;
  adding: boolean;
  onAdd: () => void;
};

export function AddToReview({ review }: { review: ReviewImportState }): ReactElement {
  if (review.imported) {
    return <Badge tone="green">In the review</Badge>;
  }
  return (
    <Button
      size="sm"
      disabled={review.refusal !== null || review.adding}
      title={
        review.refusal ?? 'A draft of the review, for the implementer with the next Send review'
      }
      onClick={() => {
        review.onAdd();
      }}
    >
      {review.adding ? 'Adding…' : 'Add to review'}
    </Button>
  );
}

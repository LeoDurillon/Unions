// What a command's output in a pull request's checkout can become: a draft comment on the review.
import type { ContainerRun } from '@union/core';
import type { ReactElement } from 'react';

import { useAddToReview, type PullRequestTarget } from '../../lib/use-review-preview';
import { Button, ErrorText } from '../ui';

export function AddRunToReview({
  target,
  run,
}: {
  target: PullRequestTarget;
  run: ContainerRun;
}): ReactElement | null {
  const add = useAddToReview(target, `/runs/${run.id}/review`);
  if (run.status === 'queued' || run.status === 'running') {
    return null;
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        disabled={add.isPending || add.isSuccess}
        onClick={() => {
          add.mutate();
        }}
      >
        {add.isSuccess ? 'Added to the review (a draft)' : 'Add to review'}
      </Button>
      <ErrorText error={add.error} />
    </div>
  );
}

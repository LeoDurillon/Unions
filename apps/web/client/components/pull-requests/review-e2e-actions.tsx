// What a pull request's end-to-end result can become: a draft comment on the review; its failure screenshots.
import type { ReactElement } from 'react';

import { previewPath } from '../../lib/preview-target';
import {
  useAddToReview,
  useReviewPreview,
  type PullRequestTarget,
} from '../../lib/use-review-preview';
import { Button, ErrorText } from '../ui';

export function ReviewE2eActions({ target }: { target: PullRequestTarget }): ReactElement | null {
  const view = useReviewPreview(target).data;
  const add = useAddToReview(target, '/preview/e2e/review');
  if (!view) {
    return null;
  }
  return (
    <>
      <Button
        disabled={add.isPending || view.e2eReviewRefusal !== null}
        title={view.e2eReviewRefusal ?? undefined}
        onClick={() => {
          add.mutate();
        }}
      >
        {add.isSuccess ? 'Added to the review' : 'Add to review'}
      </Button>
      {view.screenshots.map((shot) => (
        <a
          key={shot.name}
          className="text-xs text-indigo-600 hover:underline dark:text-indigo-400"
          href={`${previewPath(target)}/screenshots/${encodeURIComponent(shot.name)}`}
          target="_blank"
          rel="noreferrer"
        >
          {shot.name} ↗
        </a>
      ))}
      <ErrorText error={add.error} />
    </>
  );
}

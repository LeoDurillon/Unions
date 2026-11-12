// The review header's ⋯ menu: what a reviewer needs now and then, kept out of the way. For now, a ticket's import
// of its pull request's comments from GitHub.

import type { ReactElement } from 'react';

import type { DiffResponse } from '../../../src/api-types';
import type { ReviewTarget } from '../../lib/review/review-target';
import { MoreMenu } from '../ui/more-menu';
import { ImportComments } from './import-comments';

/** Nothing when there is nothing to put in it. */
export function ReviewMore({
  target,
  diff,
}: {
  target: ReviewTarget;
  diff: DiffResponse | undefined;
}): ReactElement | null {
  if (target.kind !== 'ticket' || !diff?.pullRequest) {
    return null;
  }
  return (
    <MoreMenu label="More review actions">
      <ImportComments ticketId={target.ticketId} pullRequest={diff.pullRequest} />
    </MoreMenu>
  );
}

// The top of a review page: its header, then the review's specs.
import type { ComponentProps, ReactElement } from 'react';

import { hasPullRequest } from '../../lib/review-target';
import { ReviewHeader } from './review-header';
import { SpecsBar } from './specs-bar';

export function ReviewTop(props: ComponentProps<typeof ReviewHeader>): ReactElement {
  return (
    <>
      <ReviewHeader {...props} />
      <SpecsBar target={props.target} hasPullRequest={hasPullRequest(props.target, props.diff)} />
    </>
  );
}

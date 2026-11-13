// The tracker tab's comments under the item's card: a skeleton while they are read, why they could not be, or them.

import type { UseQueryResult } from '@tanstack/react-query';
import type { IntegrationKind } from '@union/core/integration-kinds';
import type { ReactElement } from 'react';

import type { TrackerCommentsView } from '../../../src/tracker-comment-types';
import { Loading, SkeletonList } from '../ui/skeleton';
import { CARD_CLASS, ErrorText } from '../ui/ui';
import { TrackerThreadList } from './tracker-thread-list';

/** Under the item's card: the comments once read, a skeleton while they are, or why they could not be. */
export function TrackerComments({
  ticketId,
  kind,
  comments,
}: {
  ticketId: number;
  kind: IntegrationKind;
  comments: UseQueryResult<TrackerCommentsView>;
}): ReactElement {
  const { data } = comments;
  return (
    <>
      <ErrorText error={comments.error} />
      {!data && comments.isFetching ? (
        <section className={CARD_CLASS}>
          <Loading
            label="Reading the comments"
            reason={`Reading the ${kind.itemLabel} from ${kind.label}`}
          >
            <SkeletonList count={2} lines={2} />
          </Loading>
        </section>
      ) : null}
      {data ? <TrackerThreadList ticketId={ticketId} view={data} /> : null}
    </>
  );
}

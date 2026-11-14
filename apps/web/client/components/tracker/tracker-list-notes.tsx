// The notes of a tracker item's thread list: what the read left out, and the empty state when nothing is open.

import type { IntegrationKind } from '@union/core/integration-kinds';
import type { ReactElement } from 'react';

import type { TrackerCommentsView } from '../../../src/tracker-comment-types';
import { plural } from '../../lib/ui/plural';
import { TrackerEmpty } from './tracker-empty';

const NOTE = 'text-xs text-amber-700 dark:text-amber-400';

/** What the read left out: places of the item not read, or its oldest comments. */
export function LeftOut({
  view,
  kind,
}: {
  view: TrackerCommentsView;
  kind: IntegrationKind;
}): ReactElement | null {
  const { label, itemLabel } = kind;
  const shown = view.threads.reduce((sum, thread) => sum + thread.comments.length, 0);
  const left = view.total - shown;
  if (view.truncated) {
    return (
      <p className={NOTE}>
        The {itemLabel} has many commented passages: only the first ones were read. Open the{' '}
        {itemLabel} in {label} for the rest.
      </p>
    );
  }
  if (left <= 0) {
    return null;
  }
  return (
    <p className={NOTE}>
      The {itemLabel} has {plural(view.total, 'comment')}:{' '}
      {left === 1 ? 'the oldest is not shown' : `the ${left} oldest are not shown`}. Open the{' '}
      {itemLabel} in {label} for {left === 1 ? 'it' : 'them'}.
    </p>
  );
}

/** No open comment on the item: what would show here. */
export function NoComments({ kind }: { kind: IntegrationKind }): ReactElement {
  return (
    <TrackerEmpty title="No open comments">
      When someone comments on the {kind.label} {kind.itemLabel}, it shows here: reply to it, or add
      it to the review.
    </TrackerEmpty>
  );
}

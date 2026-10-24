// Groups the change by the review's specs: they are read together, each a titled section, so the
// parts can come from any of them; then the agent starts.
import { groupingLabel, groupingText } from '@union/core/review-spec-lists';
import type { ReactElement } from 'react';

import type { ReviewTarget } from '../../lib/review-target';
import { useReviewGrouping } from '../../lib/use-review-grouping';
import { useReviewSpecs } from '../../lib/use-review-specs';
import { Button, Dialog, ErrorText } from '../ui';
import { SpecSummary } from './spec-summary';

/** Groups the change by the review's specs, read together; then the agent starts. */
export function GroupBySpecDialog({
  target,
  open,
  onClose,
}: {
  target: ReviewTarget;
  open: boolean;
  onClose: () => void;
}): ReactElement {
  const specs = useReviewSpecs(target).active;
  const { start } = useReviewGrouping(target);
  const first = specs?.[0];
  return (
    <Dialog open={open} onClose={onClose} title="Group the change by spec" wide>
      <div className="space-y-4">
        <p className="text-sm text-zinc-500">
          An agent reads these specs and the change, and groups the changed files by the part of the
          specs they implement. It runs once, when you start it.
        </p>
        <SpecSummary specs={specs} onEdit={onClose} />
        <ErrorText error={start.error} />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!specs || !first || start.isPending}
            onClick={() => {
              if (specs && first) {
                start.mutate(
                  { kind: first.kind, label: groupingLabel(specs), spec: groupingText(specs) },
                  { onSuccess: onClose },
                );
              }
            }}
          >
            Start grouping
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

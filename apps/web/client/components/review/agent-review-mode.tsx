// Review with agent on a large change: in slices (one agent per part, then one on the seams) or in one pass.
// Offered when the change's lines, ignored files left out, go over the project's
// `sliceReviewAbove`; a stack is always reviewed in one pass.

import { MAX_SLICES, sliceReviewAbove } from '@union/core/agent-review-slices';
import type { ReactElement } from 'react';

import { useActiveProject } from '../../lib/app/use-active-project';
import type { ReviewTarget } from '../../lib/review/review-target';
import { useDiff } from '../../lib/review/use-review';
import { Segmented } from '../ui/choice';

export type ReviewMode = 'single' | 'sliced';

/** The change's lines the review reads, and whether they are enough to offer slices. */
export function useSliceOffer(target: ReviewTarget): { lines: number; offered: boolean } {
  const files = useDiff(target).data?.files ?? [];
  const { project } = useActiveProject();
  const lines = files
    .filter((file) => !file.ignored)
    .reduce((sum, file) => sum + file.additions + file.deletions, 0);
  const above = project ? sliceReviewAbove(project.config) : 0;
  return { lines, offered: above > 0 && lines > above };
}

/** In slices or in one pass, with what each costs. */
export function ModePicker({
  lines,
  mode,
  onChange,
}: {
  lines: number;
  mode: ReviewMode;
  onChange: (mode: ReviewMode) => void;
}): ReactElement {
  return (
    <div className="space-y-2">
      <Segmented
        legend="How the agent reads the change"
        size="sm"
        options={[
          { value: 'sliced', label: 'In slices' },
          { value: 'single', label: 'In one pass' },
        ]}
        value={mode}
        onChange={onChange}
      />
      <p className="text-xs text-zinc-500">
        {mode === 'sliced'
          ? `The change has ${lines} changed lines: too many for one agent to read whole. It is cut into parts (by spec, or by folder without specs), each reviewed by its own agent, then one more checks how they fit. Up to ${MAX_SLICES + 2} agent runs, one after another.`
          : `One agent reads the ${lines} changed lines: faster, but it usually leaves part of a change this size unread.`}
      </p>
    </div>
  );
}

// One slice of a split ticket's stack on one line: its pull request (linked), state, CI and title; its branch on hover.
import type { ReactElement } from 'react';

import type { PublicProject, StackView } from '../../../src/api-types';
import type { CheckCounts } from '../../../src/ci-api-types';
import { Badge } from '../ui';
import { SliceCi } from './slice-ci';

type Slice = StackView['slices'][number];

const STATE_TONE = { open: 'green', merged: 'blue', closed: 'red' } as const;

function PullLink({ slice, project }: { slice: Slice; project: PublicProject }): ReactElement {
  if (slice.prNumber === null) {
    return <span className="text-zinc-400">—</span>;
  }
  return (
    <a
      className="text-indigo-600 underline dark:text-indigo-400"
      href={`https://github.com/${project.owner}/${project.repo}/pull/${slice.prNumber}`}
      target="_blank"
      rel="noreferrer"
    >
      #{slice.prNumber}
    </a>
  );
}

function State({ slice }: { slice: Slice }): ReactElement | null {
  if (slice.prState === null) {
    return null;
  }
  const merged = slice.prState === 'merged' && slice.mergedInto;
  return (
    <Badge
      tone={STATE_TONE[slice.prState]}
      title={merged ? `merged into ${slice.mergedInto}` : undefined}
    >
      {slice.prState}
    </Badge>
  );
}

/** `current`: the ticket's own pull request, the one the sections below are about. */
export function StackSliceRow({
  slice,
  project,
  current,
  ci,
}: {
  slice: Slice;
  project: PublicProject;
  current: boolean;
  ci: CheckCounts | null | undefined;
}): ReactElement {
  return (
    <li
      className={`grid grid-cols-[1.25rem_3.5rem_4.5rem_5.5rem_1fr] items-center gap-2 rounded px-1 py-0.5 ${current ? 'bg-indigo-50 dark:bg-indigo-950/40' : ''}`}
    >
      <span className="text-right text-zinc-500">{slice.position}</span>
      <PullLink slice={slice} project={project} />
      <span>
        <State slice={slice} />
      </span>
      <SliceCi counts={ci} />
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate" title={`${slice.title}\n${slice.branch}`}>
          {slice.title}
        </span>
        {current ? <span className="shrink-0 text-xs text-zinc-500">shown below</span> : null}
      </span>
    </li>
  );
}

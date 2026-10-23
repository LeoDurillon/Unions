// Which pull request of a split ticket's stack the PR tab's checks, description and discussion are about, bottom first.
import type { ReactElement } from 'react';

import type { StackView } from '../../../src/api-types';
import { Segmented } from '../choice';

/** The slices' pull requests, bottom first; none when the ticket is not split. */
export function stackPullRequests(stack: StackView | null | undefined): number[] {
  return (stack?.slices ?? []).flatMap((slice) =>
    slice.prNumber === null ? [] : [slice.prNumber],
  );
}

export function StackPrPicker({
  stack,
  value,
  onChange,
}: {
  stack: StackView;
  value: number;
  onChange: (pr: number) => void;
}): ReactElement | null {
  const slices = stack.slices.filter((slice) => slice.prNumber !== null);
  if (slices.length < 2) {
    return null;
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-sm text-zinc-500">Checks, description and discussion of</span>
      <Segmented
        legend="Pull request of the stack, bottom first"
        size="sm"
        value={String(value)}
        onChange={(picked) => {
          onChange(Number(picked));
        }}
        options={slices.map((slice) => ({
          value: String(slice.prNumber),
          title: `${slice.position}. ${slice.title}`,
          label: `#${slice.prNumber}`,
        }))}
      />
    </div>
  );
}

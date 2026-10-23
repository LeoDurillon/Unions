// A split ticket's slices as a segmented control under the review header: All, then each slice with its pull request and drafts.
import type { ReactElement } from 'react';

import type { CommentView } from '../../../src/api-types';
import { draftsByTab } from '../../lib/slice-view';
import type { SliceView } from '../../lib/use-slice-view';
import { Segmented } from '../choice';

const ALL = 'all';

function TabLabel({ text, drafts }: { text: string; drafts: number }): ReactElement {
  return (
    <span className="flex items-center gap-1.5">
      {text}
      {drafts > 0 ? (
        <span className="text-amber-700 dark:text-amber-400" aria-label={`${drafts} drafts`}>
          {drafts}
        </span>
      ) : null}
    </span>
  );
}

/** Nothing on a ticket not split. `comments` are all the ticket's, for the draft counts. */
export function SliceTabs({
  view,
  comments,
}: {
  view: SliceView;
  comments: CommentView[];
}): ReactElement | null {
  const { slices, slice, setSlice } = view;
  if (slices.length === 0) {
    return null;
  }
  const drafts = draftsByTab(comments, new Set(slices.map((candidate) => candidate.position)));
  return (
    <div className="flex items-center gap-3 border-b border-zinc-200 bg-white px-4 py-2 dark:border-zinc-800 dark:bg-zinc-900">
      <span className="shrink-0 text-xs text-zinc-500">Stack of {slices.length}</span>
      <Segmented
        legend="The whole change, or one slice of the stack, bottom first"
        size="sm"
        value={slice === null ? ALL : String(slice)}
        onChange={(value) => {
          setSlice(value === ALL ? null : Number(value));
        }}
        options={[
          { value: ALL, label: <TabLabel text="All" drafts={drafts.get(null) ?? 0} /> },
          ...slices.map(({ position, title, prNumber }) => ({
            value: String(position),
            title: `Slice ${position}: ${title}`,
            label: (
              <TabLabel
                text={prNumber === null ? `${position}` : `${position} #${prNumber}`}
                drafts={drafts.get(position) ?? 0}
              />
            ),
          })),
        ]}
      />
    </div>
  );
}

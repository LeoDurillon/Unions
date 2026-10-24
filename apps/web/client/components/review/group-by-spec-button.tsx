// The file panel's "By spec" switch: shows the files under the parts of a specification, and the
// first time (or Regroup) asks an agent to group them; where the grouping stands, under the switch.
import { useState, type ReactElement } from 'react';

import type { GroupingView } from '../../../src/routes/review-groupings';
import type { ReviewTarget } from '../../lib/review-target';
import { isGrouping, useReviewGrouping } from '../../lib/use-review-grouping';
import { Button, ErrorText } from '../ui';
import { GroupBySpecDialog } from './group-by-spec-dialog';
import { specSources } from './spec-picker';

const ON = 'border-indigo-300 bg-indigo-100 font-medium dark:border-indigo-800 dark:bg-indigo-950';
const SHOW_TITLE = 'Show the files under the parts of the specification they implement';
const ASK_TITLE = 'An agent groups the changed files by the parts of a specification you choose';
const OFF =
  'border-zinc-300 text-zinc-500 hover:text-zinc-900 dark:border-zinc-700 dark:hover:text-zinc-100';

const BY_SPEC_KEY = 'union.review.bySpec';

function storedBySpec(): boolean {
  try {
    return localStorage.getItem(BY_SPEC_KEY) !== 'off';
  } catch {
    return true;
  }
}

/** Whether the files show under their spec groups, remembered in this browser (on unless turned off). */
function useBySpec(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(storedBySpec);
  const choose = (next: boolean): void => {
    setOn(next);
    try {
      localStorage.setItem(BY_SPEC_KEY, next ? 'on' : 'off');
    } catch {
      // Storage blocked: the choice lasts until the page closes.
    }
  };
  return [on, choose];
}

function Toggle({
  pressed,
  busy,
  title,
  onClick,
}: {
  pressed: boolean;
  busy: boolean;
  title: string;
  onClick: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      title={title}
      onClick={onClick}
      className={`rounded-md border px-2 py-0.5 text-xs transition ${pressed ? ON : OFF} ${busy ? 'animate-pulse' : ''}`}
    >
      By spec
    </button>
  );
}

/** "Grouping…" with Cancel, or why the last grouping failed, else Regroup once there is one. */
function GroupingStatus({
  target,
  grouped,
  onRegroup,
}: {
  target: ReviewTarget;
  grouped: boolean;
  onRegroup: () => void;
}): ReactElement | null {
  const { grouping, cancel } = useReviewGrouping(target);
  const latest = grouping.data;
  if (isGrouping(latest)) {
    return (
      <div className="flex items-center gap-2 px-2 text-xs">
        <span className="animate-pulse text-indigo-600 dark:text-indigo-400">
          {latest?.status === 'queued' ? 'Grouping queued…' : 'Grouping by spec…'}
        </span>
        <Button
          variant="ghost"
          className="px-2 py-0.5 text-xs"
          disabled={cancel.isPending}
          onClick={() => {
            cancel.mutate();
          }}
        >
          Cancel
        </Button>
        <ErrorText error={cancel.error} />
      </div>
    );
  }
  if (latest?.status === 'failed') {
    return (
      <p
        className="truncate px-2 text-xs text-red-600 dark:text-red-400"
        title={latest.error ?? ''}
      >
        Grouping failed: {latest.error}
      </p>
    );
  }
  return grouped ? (
    <button
      type="button"
      className="px-2 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
      onClick={onRegroup}
    >
      Regroup with another spec…
    </button>
  ) : null;
}

/** The grouping to show the files under, when it succeeded and the switch is on. */
function shownGrouping(latest: GroupingView | null | undefined, on: boolean): GroupingView | null {
  return on && latest?.status === 'succeeded' && latest.result !== null ? latest : null;
}

/**
 * The "By spec" switch for the file list's header, where the grouping stands (for under it), and the
 * grouping to show. With no grouping yet, the switch opens the dialog that asks the agent for one.
 * `whole`: false for a slice or one commit, which the grouping of the whole change does not fit.
 */
export function useBySpecControl({
  target,
  hasPullRequest,
  whole,
}: {
  target: ReviewTarget;
  hasPullRequest: boolean;
  whole: boolean;
}): { toggle: ReactElement | null; status: ReactElement | null; groups: GroupingView | null } {
  const latest = useReviewGrouping(target).grouping.data;
  const [on, setOn] = useBySpec();
  const [open, setOpen] = useState(false);
  if (!whole) {
    return { toggle: null, status: null, groups: null };
  }
  const busy = isGrouping(latest);
  const groups = shownGrouping(latest, on);
  const grouped = shownGrouping(latest, true) !== null;
  const ask = (): void => {
    setOn(true);
    setOpen(true);
  };
  const toggle = (
    <>
      <Toggle
        pressed={groups !== null || busy}
        busy={busy}
        title={grouped ? SHOW_TITLE : ASK_TITLE}
        onClick={() => {
          if (grouped) {
            setOn(!on);
          } else if (!busy) {
            ask();
          }
        }}
      />
      {open ? (
        <GroupBySpecDialog
          target={target}
          sources={specSources(target, hasPullRequest)}
          open={open}
          onClose={() => {
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
  const status = <GroupingStatus target={target} grouped={groups !== null} onRegroup={ask} />;
  return { toggle, status, groups };
}

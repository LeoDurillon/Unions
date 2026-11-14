// The review header's left side: Back, what is reviewed (files, base, commit) over the title, files viewed.

import type { ReactElement } from 'react';

import type { DiffResponse } from '../../../src/api-types';
import { plural } from '../../lib/ui/plural';
import { FOCUS_RING } from '../ui/focus';
import { ReviewProgress } from './review-progress';

const SHORT_SHA = 7;

/** Back to where the review was opened from. */
function BackButton({ onClick }: { onClick: () => void }): ReactElement {
  return (
    <button
      type="button"
      aria-label="Back"
      title="Back"
      onClick={onClick}
      className={`flex size-8 shrink-0 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800 ${FOCUS_RING}`}
    >
      <span aria-hidden>←</span>
    </button>
  );
}

/** What is reviewed: the count of files, the base and the commit over the title. */
function ReviewTitle({
  title,
  diff,
}: {
  title: string;
  diff: DiffResponse | undefined;
}): ReactElement {
  const snapshot = diff?.snapshot;
  const ignoredCount = diff?.files.filter((file) => file.ignored).length ?? 0;
  return (
    <div className="min-w-48 flex-1">
      {snapshot ? (
        <p className="truncate font-mono text-[11.5px] text-zinc-500">
          {plural(diff.files.length, 'file')} against {snapshot.baseBranch}
          {ignoredCount > 0 ? ` (${ignoredCount} ignored)` : ''} ·{' '}
          {snapshot.headSha.slice(0, SHORT_SHA)}
        </p>
      ) : null}
      <h2 className="truncate text-[16px] font-semibold tracking-tight" title={title}>
        {title}
      </h2>
    </div>
  );
}

/** Back, what is reviewed and at which commit, and how many files were viewed. */
export function ReviewHeaderLead({
  title,
  diff,
  onBack,
}: {
  title: string;
  diff: DiffResponse | undefined;
  onBack: () => void;
}): ReactElement {
  return (
    <>
      <BackButton onClick={onBack} />
      <ReviewTitle title={title} diff={diff} />
      <ReviewProgress files={diff?.files ?? []} />
    </>
  );
}

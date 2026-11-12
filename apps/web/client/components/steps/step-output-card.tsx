// A step's output as a card: its version, when it was written and whether it was approved, above the text.

import type { StepOutput } from '@union/core';
import type { ReactElement, ReactNode } from 'react';

import { timeAgo } from '../../lib/ui/relative-time';
import { useNow } from '../../lib/ui/use-now';
import { Badge } from '../ui/ui';

const VALIDATION_TONE = { approved: 'green', revise: 'neutral' } as const;
const VALIDATION_LABEL = {
  approved: 'approved',
  revise: 'revision requested',
} as const;

function VersionPicker({
  versions,
  shown,
  onPick,
}: {
  versions: StepOutput[];
  shown: StepOutput;
  onPick: (version: number) => void;
}): ReactElement {
  if (versions.length === 1) {
    return <span className="font-medium">Version {shown.version}</span>;
  }
  return (
    <select
      aria-label="Version"
      className="rounded-md border border-zinc-300 bg-white px-2 py-0.5 text-sm font-medium dark:border-zinc-700 dark:bg-zinc-900"
      value={shown.version}
      onChange={(event) => {
        onPick(Number(event.target.value));
      }}
    >
      {versions.map((output) => (
        <option key={output.version} value={output.version}>
          Version {output.version} of {versions.length}
        </option>
      ))}
    </select>
  );
}

function CardHeader({
  versions,
  shown,
  onPick,
}: {
  versions: StepOutput[];
  shown: StepOutput;
  onPick: (version: number) => void;
}): ReactElement {
  const now = useNow(true);
  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-zinc-200 px-4 py-2.5 text-sm dark:border-zinc-800">
      <VersionPicker versions={versions} shown={shown} onPick={onPick} />
      <span className="text-xs text-zinc-500">written {timeAgo(shown.createdAt, now)}</span>
      <span className="flex-1" />
      {/* A version still to approve says nothing here: the ticket's badge already says "Waiting for you". */}
      {shown.validation === 'pending' ? null : (
        <Badge tone={VALIDATION_TONE[shown.validation]}>{VALIDATION_LABEL[shown.validation]}</Badge>
      )}
    </header>
  );
}

/** The feedback a version got when a revision was asked, under its header. */
function FeedbackNote({ feedback }: { feedback: string | null }): ReactElement | null {
  return feedback ? (
    <p className="border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950">
      <span className="font-medium">Feedback on this version:</span> {feedback}
    </p>
  ) : null;
}

export function StepOutputCard({
  versions,
  shown,
  onPick,
  children,
}: {
  versions: StepOutput[];
  shown: StepOutput;
  onPick: (version: number) => void;
  /** The text, or the answer form. */
  children: ReactNode;
}): ReactElement {
  return (
    <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
      <CardHeader versions={versions} shown={shown} onPick={onPick} />
      <FeedbackNote feedback={shown.feedback} />
      <div className="space-y-3 px-4 py-3">{children}</div>
    </section>
  );
}

/** In place of the card while the step has no output: running, or not reached yet. */
export function NoOutput({ working }: { working: boolean }): ReactElement {
  return (
    <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
      {working ? (
        <span className="inline-flex items-center gap-2 text-blue-600 dark:text-blue-400">
          <span aria-hidden className="size-2 animate-pulse rounded-full bg-blue-500" />
          The agent is working on it. The Log tab shows what it does.
        </span>
      ) : (
        'No output yet.'
      )}
    </p>
  );
}

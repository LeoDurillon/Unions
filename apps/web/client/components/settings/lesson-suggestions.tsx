// The lesson writer's latest run on the Memory page: working, failed, or its proposals to accept one by one or all.
import type { LessonSuggestion } from '@union/core';
import type { LessonInput } from '@union/core/lesson-input';
import { useState, type ReactElement } from 'react';

import { useLessonSuggestion, useLessonWriter } from '../../lib/use-memory';
import { Badge, Button, ErrorText } from '../ui';
import { lessonTitle } from './lesson-list';

/** Adds lessons to the page's form, with the feedback they came from (curated on Save). */
export type AcceptLessons = (lessons: LessonInput[], feedbackIds: number[]) => void;

function feedbackCount(row: LessonSuggestion): string {
  const count = row.feedbackIds.length;
  return `${count} feedback item${count === 1 ? '' : 's'}`;
}

function proposalsNote(row: LessonSuggestion): string {
  const count = row.suggestions?.length ?? 0;
  return count === 0
    ? `No lesson holds beyond its ticket in ${feedbackCount(row)}.`
    : `${count} proposed from ${feedbackCount(row)}. Accepted ones join the lessons above; Save keeps them.`;
}

function ProposalRow({
  proposal,
  accepted,
  onAccept,
}: {
  proposal: LessonInput;
  accepted: boolean;
  onAccept: () => void;
}): ReactElement {
  return (
    <li className="flex items-start gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
      <Badge tone="blue">{lessonTitle(proposal.section)}</Badge>
      <p className="min-w-0 flex-1 text-sm break-words">{proposal.rule}</p>
      {accepted ? (
        <span className="text-xs text-green-700 dark:text-green-400">Accepted</span>
      ) : (
        <Button className="px-2 py-1 text-xs" onClick={onAccept}>
          Accept
        </Button>
      )}
    </li>
  );
}

function Proposals({
  row,
  onAccept,
  onDismiss,
}: {
  row: LessonSuggestion;
  onAccept: AcceptLessons;
  onDismiss: () => void;
}): ReactElement {
  const [accepted, setAccepted] = useState<number[]>([]);
  const proposals = row.suggestions ?? [];
  const accept = (indexes: number[]): void => {
    const fresh = indexes.filter((index) => !accepted.includes(index));
    onAccept(
      fresh.flatMap((index) => proposals[index] ?? []),
      row.feedbackIds,
    );
    setAccepted([...accepted, ...fresh]);
  };
  const waiting = proposals.flatMap((_proposal, index) =>
    accepted.includes(index) ? [] : [index],
  );
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-zinc-500">{proposalsNote(row)}</p>
        <div className="flex gap-2">
          {waiting.length > 1 ? (
            <Button
              className="px-2 py-1 text-xs"
              onClick={() => {
                accept(waiting);
              }}
            >
              Accept all
            </Button>
          ) : null}
          <Button className="px-2 py-1 text-xs" onClick={onDismiss}>
            Dismiss
          </Button>
        </div>
      </div>
      <ul className="space-y-1.5">
        {proposals.map((proposal, index) => (
          <ProposalRow
            key={`${proposal.section}:${proposal.rule}`}
            proposal={proposal}
            accepted={accepted.includes(index)}
            onAccept={() => {
              accept([index]);
            }}
          />
        ))}
      </ul>
    </div>
  );
}

/** Nothing until the user asks the lesson writer; then where its run stands. */
export function LessonSuggestions({
  projectId,
  onAccept,
}: {
  projectId: number;
  onAccept: AcceptLessons;
}): ReactElement | null {
  const { data: row } = useLessonSuggestion(projectId);
  const { dismiss } = useLessonWriter(projectId);
  if (!row) {
    return null;
  }
  const close = (): void => {
    dismiss.mutate(row.id);
  };
  return (
    <div className="space-y-2 rounded-md border border-indigo-200 bg-indigo-50/50 p-3 dark:border-indigo-900 dark:bg-indigo-950/30">
      <h4 className="text-sm font-medium">Proposed lessons</h4>
      {row.status === 'queued' || row.status === 'running' ? (
        <p className="text-xs text-zinc-500">The lesson writer is reading {feedbackCount(row)}…</p>
      ) : null}
      {row.status === 'failed' ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-red-600">The lesson writer failed: {row.error}</p>
          <Button className="px-2 py-1 text-xs" onClick={close}>
            Dismiss
          </Button>
        </div>
      ) : null}
      {row.status === 'ready' ? (
        <Proposals key={row.id} row={row} onAccept={onAccept} onDismiss={close} />
      ) : null}
      <ErrorText error={dismiss.error} />
    </div>
  );
}

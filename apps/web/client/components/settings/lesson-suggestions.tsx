// The lesson writer's or tidier's latest run on the Memory page: working, failed, or its proposals.
// The proposals (new lessons, ones replacing kept lessons, removals) are accepted one by one or
// all.
import type { LessonSuggestion } from '@union/core';
import type { LessonInput, LessonProposal } from '@union/core/lesson-input';
import { useState, type ReactElement } from 'react';

import { useLessonSuggestion, useLessonWriter } from '../../lib/use-memory';
import { Badge, Button, ErrorText } from '../ui';
import { lessonTitle } from './lesson-list';

/**
 * Puts proposals in the page's form (added, or in place of the lessons they replace), with the
 * feedback they came from (curated on Save).
 */
export type AcceptLessons = (proposals: LessonProposal[], feedbackIds: number[]) => void;

function feedbackCount(row: LessonSuggestion): string {
  const count = row.feedbackIds.length;
  return `${count} feedback item${count === 1 ? '' : 's'}`;
}

function proposalsNote(row: LessonSuggestion): string {
  const count = row.suggestions?.length ?? 0;
  if (row.kind === 'tidy') {
    return count === 0
      ? 'The lesson tidier found nothing to change.'
      : `${count} change${count === 1 ? '' : 's'} proposed. Accepted ones apply to the lessons below; Save keeps them.`;
  }
  return count === 0
    ? `No lesson holds beyond its ticket in ${feedbackCount(row)}.`
    : `${count} proposed from ${feedbackCount(row)}. Accepted ones join the lessons above, in place of the ones they replace; Save keeps them.`;
}

/** The lessons a proposal takes the place of, as the page has them now. */
function Replaced({
  ids,
  lessons,
  verb,
}: {
  ids: readonly number[];
  lessons: readonly LessonInput[];
  verb: 'Replaces' | 'Removes';
}): ReactElement {
  return (
    <ul className="mt-1 space-y-0.5 text-xs text-zinc-500">
      {ids.map((id) => {
        const lesson = lessons.find((kept) => kept.id === id);
        return (
          <li key={id} className="break-words">
            {verb}{' '}
            {lesson ? (
              <>
                <span className="font-medium">{lessonTitle(lesson.section)}</span>:{' '}
                <span className="line-through">{lesson.rule}</span>
              </>
            ) : (
              'a lesson no longer on the page'
            )}
          </li>
        );
      })}
    </ul>
  );
}

function actionLabel(removal: boolean, replaced: number): string {
  if (removal) {
    return 'Remove';
  }
  return replaced > 0 ? 'Replace' : 'Accept';
}

/** What a run is doing while it works. */
function workingNote(row: LessonSuggestion): string {
  return row.kind === 'tidy'
    ? 'The lesson tidier is reading the lessons…'
    : `The lesson writer is reading ${feedbackCount(row)}…`;
}

function ProposalRow({
  proposal,
  lessons,
  accepted,
  onAccept,
}: {
  proposal: LessonProposal;
  lessons: readonly LessonInput[];
  accepted: boolean;
  onAccept: () => void;
}): ReactElement {
  const replaces = proposal.replaces ?? [];
  const removal = proposal.rule === '';
  return (
    <li className="flex items-start gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
      {removal ? (
        <Badge tone="neutral">Remove</Badge>
      ) : (
        <Badge tone="blue">{lessonTitle(proposal.section)}</Badge>
      )}
      <div className="min-w-0 flex-1">
        {removal ? null : <p className="text-sm break-words">{proposal.rule}</p>}
        {replaces.length > 0 && !accepted ? (
          <Replaced ids={replaces} lessons={lessons} verb={removal ? 'Removes' : 'Replaces'} />
        ) : null}
        {proposal.why === undefined ? null : (
          <p className="mt-1 text-xs break-words text-zinc-500 italic">{proposal.why}</p>
        )}
      </div>
      {accepted ? (
        <span className="text-xs text-green-700 dark:text-green-400">Accepted</span>
      ) : (
        <Button className="px-2 py-1 text-xs" onClick={onAccept}>
          {actionLabel(removal, replaces.length)}
        </Button>
      )}
    </li>
  );
}

function Proposals({
  row,
  lessons,
  onAccept,
  onDismiss,
}: {
  row: LessonSuggestion;
  lessons: readonly LessonInput[];
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
            lessons={lessons}
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
  kind,
  lessons,
  onAccept,
}: {
  projectId: number;
  /** The runs this place shows: the writer's under the feedback, the tidier's under the lessons. */
  kind: LessonSuggestion['kind'];
  lessons: readonly LessonInput[];
  onAccept: AcceptLessons;
}): ReactElement | null {
  const { data: row } = useLessonSuggestion(projectId);
  const { dismiss } = useLessonWriter(projectId);
  if (!row || row.kind !== kind) {
    return null;
  }
  const close = (): void => {
    dismiss.mutate(row.id);
  };
  return (
    <div className="space-y-2 rounded-md border border-indigo-200 bg-indigo-50/50 p-3 dark:border-indigo-900 dark:bg-indigo-950/30">
      <h4 className="text-sm font-medium">
        {kind === 'tidy' ? 'Proposed changes' : 'Proposed lessons'}
      </h4>
      {row.status === 'queued' || row.status === 'running' ? (
        <p className="text-xs text-zinc-500">{workingNote(row)}</p>
      ) : null}
      {row.status === 'failed' ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-red-600">
            The lesson {row.kind === 'tidy' ? 'tidier' : 'writer'} failed: {row.error}
          </p>
          <Button className="px-2 py-1 text-xs" onClick={close}>
            Dismiss
          </Button>
        </div>
      ) : null}
      {row.status === 'ready' ? (
        <Proposals key={row.id} row={row} lessons={lessons} onAccept={onAccept} onDismiss={close} />
      ) : null}
      <ErrorText error={dismiss.error} />
    </div>
  );
}

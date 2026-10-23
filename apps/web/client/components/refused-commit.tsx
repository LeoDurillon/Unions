// Shown on the step paused on a refused commit: the changes, the hook's output, the decision.
import { useQuery } from '@tanstack/react-query';
import type { RefusedCommit, Step } from '@union/core';
import { useState, type ReactElement } from 'react';

import type { TicketDetail } from '../../src/api-types';
import { fetchRefusedCommit } from '../lib/refused-commit-api';
import { useTicketCommands } from '../lib/use-ticket-commands';
import { Button, ErrorText, inputClass } from './ui';

const PRE_CLASS =
  'max-h-80 overflow-auto rounded-md bg-zinc-100 p-2 font-mono text-xs whitespace-pre dark:bg-zinc-900';

function lineClass(line: string): string {
  if (line.startsWith('+') && !line.startsWith('+++')) {
    return 'text-green-700 dark:text-green-400';
  }
  if (line.startsWith('-') && !line.startsWith('---')) {
    return 'text-red-700 dark:text-red-400';
  }
  return line.startsWith('@@') ? 'text-blue-600 dark:text-blue-400' : '';
}

function PlainDiff({ diff }: { diff: string }): ReactElement {
  return (
    <pre className={PRE_CLASS}>
      {diff.split('\n').map((line, index) => (
        // Lines of a fixed text: their position is their identity.
        // oxlint-disable-next-line react/no-array-index-key
        <div key={index} className={lineClass(line)}>
          {line === '' ? ' ' : line}
        </div>
      ))}
    </pre>
  );
}

function Details({ refusal }: { refusal: RefusedCommit }): ReactElement {
  return (
    <>
      <ul className="list-inside list-disc text-sm">
        {refusal.files.map((file) => (
          <li key={file}>
            <code>{file}</code>
          </li>
        ))}
      </ul>
      <details open>
        <summary className="cursor-pointer text-sm font-medium">What the hook said</summary>
        <pre className={PRE_CLASS}>{refusal.hookOutput}</pre>
      </details>
      <details>
        <summary className="cursor-pointer text-sm font-medium">The changes</summary>
        <PlainDiff diff={refusal.diff} />
      </details>
    </>
  );
}

function SendBack({
  busy,
  onSend,
  onCancel,
}: {
  busy: boolean;
  onSend: (feedback: string) => void;
  onCancel: () => void;
}): ReactElement {
  const [feedback, setFeedback] = useState('');
  return (
    <div className="space-y-2">
      <textarea
        className={`${inputClass} min-h-24`}
        placeholder="What the agent should do, for example: fix the warnings of this page in a separate commit"
        aria-label="Guidance for the agent"
        value={feedback}
        onChange={(event) => {
          setFeedback(event.target.value);
        }}
      />
      <div className="flex gap-2">
        <Button
          variant="primary"
          disabled={busy || feedback.trim() === ''}
          onClick={() => {
            onSend(feedback.trim());
          }}
        >
          Send to the agent
        </Button>
        <Button onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

function DecisionButtons({
  busy,
  canCommit,
  leaveOutLabel,
  onCommit,
  onLeaveOut,
  onSendBack,
}: {
  busy: boolean;
  canCommit: boolean;
  leaveOutLabel: string;
  onCommit: () => void;
  onLeaveOut: () => void;
  onSendBack: (() => void) | null;
}): ReactElement {
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="primary" disabled={busy || !canCommit} onClick={onCommit}>
        Commit without hooks and continue
      </Button>
      <Button disabled={busy} onClick={onLeaveOut}>
        {leaveOutLabel}
      </Button>
      {onSendBack ? (
        <Button disabled={busy} onClick={onSendBack}>
          Send back to the agent
        </Button>
      ) : null}
    </div>
  );
}

/** Leaving the changes out of a simplified history would change the code: it keeps the old one. */
const LEAVE_OUT_LABELS: Partial<Record<Step, string>> = {
  simplify: 'Keep the old history',
};

function Decision({ refusal, step }: { refusal: RefusedCommit; step: Step }): ReactElement {
  const canSendBack = step === 'implement';
  const { command } = useTicketCommands(refusal.ticketId);
  const [message, setMessage] = useState(refusal.message);
  const [sendingBack, setSendingBack] = useState(false);
  const refusalId = refusal.id;
  return (
    <div className="space-y-2">
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Commit message</span>
        <input
          className={inputClass}
          value={message}
          onChange={(event) => {
            setMessage(event.target.value);
          }}
        />
      </label>
      <DecisionButtons
        busy={command.isPending}
        canCommit={message.trim() !== ''}
        leaveOutLabel={LEAVE_OUT_LABELS[step] ?? 'Leave these changes out and continue'}
        onCommit={() => {
          command.mutate({ type: 'commit_anyway', refusalId, message: message.trim() });
        }}
        onLeaveOut={() => {
          command.mutate({ type: 'drop_leftovers', refusalId });
        }}
        onSendBack={
          canSendBack && !sendingBack
            ? () => {
                setSendingBack(true);
              }
            : null
        }
      />
      {sendingBack ? (
        <SendBack
          busy={command.isPending}
          onSend={(feedback) => {
            command.mutate({ type: 'revise', feedback });
          }}
          onCancel={() => {
            setSendingBack(false);
          }}
        />
      ) : null}
      <ErrorText error={command.error} />
    </div>
  );
}

function RefusedCommitView({ ticketId, step }: { ticketId: number; step: Step }): ReactElement {
  const query = useQuery({
    queryKey: ['ticket', ticketId, 'refused-commit'],
    queryFn: () => fetchRefusedCommit(ticketId),
  });
  const refusal = query.data;
  return (
    <section
      className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40"
      aria-label="Commit refused by a hook"
    >
      <h3 className="text-sm font-semibold">A git hook refused to commit some changes</h3>
      <p className="text-sm">
        The agent left these changes uncommitted because the repository&apos;s hook refused them.
        Nothing is pushed until you decide. Your choice applies to exactly these changes: if they
        change before the run resumes, you are asked again. Changes left out are kept in a stash in
        the ticket&apos;s workspace.
      </p>
      <ErrorText error={query.error} />
      {refusal ? (
        <>
          <Details refusal={refusal} />
          <Decision key={refusal.id} refusal={refusal} step={step} />
        </>
      ) : null}
    </section>
  );
}

/** Shown on the step paused on a refused commit: the changes, the hook's output, the decision. */
export function RefusedCommitPanel({
  detail,
  step,
}: {
  detail: TicketDetail;
  step: Step;
}): ReactElement | null {
  const { phase, id } = detail.ticket;
  if (phase.kind !== 'commit_refused' || phase.step !== step) {
    return null;
  }
  return <RefusedCommitView ticketId={id} step={step} />;
}

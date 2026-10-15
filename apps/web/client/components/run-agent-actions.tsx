import type { ContainerRun } from '@union/core';
import { useState, type ReactElement } from 'react';

import { Badge, Button, inputClass } from './ui';

/** Where the output stands with the implementer. */
function AgentState({ forAgent }: { forAgent: ContainerRun['forAgent'] }): ReactElement | null {
  if (forAgent === 'next_run') {
    return <Badge tone="amber">For the agent&apos;s next run</Badge>;
  }
  return forAgent === 'sent' ? <Badge tone="neutral">Read by the agent</Badge> : null;
}

/** The note that goes with the output as the revision's feedback (a default one when empty). */
function SendForm({
  pending,
  onSend,
  onClose,
}: {
  pending: boolean;
  onSend: (note: string) => void;
  onClose: () => void;
}): ReactElement {
  const [note, setNote] = useState('');
  return (
    <div className="space-y-1">
      <textarea
        aria-label="Note for the agent"
        className={inputClass}
        rows={2}
        value={note}
        placeholder="What to do with it (optional): fix the import so this passes…"
        onChange={(event) => {
          setNote(event.target.value);
        }}
      />
      <div className="flex gap-2">
        <Button
          variant="primary"
          disabled={pending}
          onClick={() => {
            onSend(note);
          }}
        >
          Send to the agent now
        </Button>
        <Button onClick={onClose}>Close</Button>
      </div>
    </div>
  );
}

/**
 * Giving a finished run's output to the implementer: kept for its next run, or sent now as a
 * revision (when the ticket can go back to it) with a note.
 */
export function RunAgentActions({
  run,
  canSend,
  pending,
  onKeep,
  onSend,
}: {
  run: ContainerRun;
  canSend: boolean;
  pending: boolean;
  onKeep: (keep: boolean) => void;
  onSend: (note: string) => void;
}): ReactElement | null {
  const [sending, setSending] = useState(false);
  if (run.status === 'queued' || run.status === 'running') {
    return null;
  }
  const kept = run.forAgent === 'next_run';
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <AgentState forAgent={run.forAgent} />
        {run.forAgent === 'sent' ? null : (
          <Button
            disabled={pending}
            onClick={() => {
              onKeep(!kept);
            }}
          >
            {kept ? 'Take back' : 'Keep for next run'}
          </Button>
        )}
        {canSend && run.forAgent !== 'sent' && !sending ? (
          <Button
            disabled={pending}
            onClick={() => {
              setSending(true);
            }}
          >
            Send to agent…
          </Button>
        ) : null}
      </div>
      {sending && canSend ? (
        <SendForm
          pending={pending}
          onSend={onSend}
          onClose={() => {
            setSending(false);
          }}
        />
      ) : null}
    </div>
  );
}

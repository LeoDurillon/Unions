// Turns the investigation into a backlog ticket written by an agent: the header's buttons (Open ticket, Write a
// ticket from it), then under it the form asking what the ticket covers, the ticket being written, or why it failed.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { IntegrationKindName, Investigation } from '@union/core';
import { integrationKind } from '@union/core/integration-kinds';
import { useState, type ReactElement } from 'react';

import { api } from '../../lib/api';
import { Switch } from '../choice';
import { Button, ErrorText, inputClass } from '../ui';

/** One switch per tracker; one at most is on (a ticket has one origin). */
function TargetOptions({
  targets,
  value,
  onChange,
}: {
  targets: IntegrationKindName[];
  value: IntegrationKindName | null;
  onChange: (value: IntegrationKindName | null) => void;
}): ReactElement {
  return (
    <>
      {targets.map((kind) => {
        const { label, itemLabel, sourceLabel } = integrationKind(kind);
        return (
          <Switch
            key={kind}
            checked={value === kind}
            onChange={(checked) => {
              onChange(checked ? kind : null);
            }}
            hint={`A ${itemLabel} with the ticket's title and description, in the project's ${label} ${sourceLabel}; the ticket is linked to it.`}
          >
            Also create it in {label}
          </Switch>
        );
      })}
    </>
  );
}

function Ask({
  investigation,
  targets,
  onCancel,
}: {
  investigation: Investigation;
  targets: IntegrationKindName[];
  onCancel: () => void;
}): ReactElement {
  const queryClient = useQueryClient();
  const [context, setContext] = useState('');
  const [target, setTarget] = useState<IntegrationKindName | null>(null);
  const ask = useMutation({
    mutationFn: () => api.requestInvestigationTicket(investigation, { context, target }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['investigations'] });
      onCancel();
    },
  });
  return (
    <div className="space-y-2 rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 dark:border-indigo-900 dark:bg-indigo-950/30">
      <label className="block space-y-1 text-sm">
        <span className="font-medium">What should the ticket cover?</span>
        <span className="block text-xs text-zinc-500">
          Optional. An agent writes the ticket from the whole investigation and this, in the
          language you wrote in; it lands in the Backlog.
          {investigation.scope === 'ticket' && investigation.onTicketId !== null
            ? ' It depends on the ticket investigated: it starts once that one is done, from its branch.'
            : ''}
        </span>
        <textarea
          className={`${inputClass} min-h-20`}
          placeholder="e.g. Only the backend fix; leave the UI for later."
          value={context}
          onChange={(event) => {
            setContext(event.target.value);
          }}
        />
      </label>
      <TargetOptions targets={targets} value={target} onChange={setTarget} />
      <ErrorText error={ask.error} />
      <div className="flex gap-2">
        <Button
          variant="primary"
          disabled={ask.isPending}
          onClick={() => {
            ask.mutate();
          }}
        >
          Write the ticket
        </Button>
        <Button onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

/** Why the ticket failed, or why it has no item in the tracker it was asked in. */
function TicketError({
  status,
  error,
}: {
  status: Investigation['ticketStatus'];
  error: string | null;
}): ReactElement | null {
  if (status === 'failed') {
    return (
      <p className="text-sm text-red-700 dark:text-red-400">
        The ticket could not be written: {error}
      </p>
    );
  }
  return error === null ? null : (
    <p className="text-sm text-amber-700 dark:text-amber-400">{error}</p>
  );
}

function writing(investigation: Investigation): boolean {
  return investigation.ticketStatus === 'queued' || investigation.ticketStatus === 'running';
}

/** Under the header: the ticket being written, the form asking what it covers, or why the last one failed. */
export function InvestigationTicket({
  investigation,
  targets,
  asking,
  onClose,
}: {
  investigation: Investigation;
  targets: IntegrationKindName[];
  /** Write a ticket from it was clicked: the form shows. */
  asking: boolean;
  onClose: () => void;
}): ReactElement | null {
  if (writing(investigation)) {
    return (
      <p className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
        <span className="size-2 animate-pulse rounded-full bg-blue-500" />
        An agent is writing the ticket; it lands in the Backlog.
      </p>
    );
  }
  if (asking) {
    return <Ask investigation={investigation} targets={targets} onCancel={onClose} />;
  }
  return <TicketError status={investigation.ticketStatus} error={investigation.ticketError} />;
}

/** The header's ticket buttons: Open ticket once one was written, and Write a ticket from it once answered. */
export function TicketButtons({
  investigation,
  onAsk,
  onOpenTicket,
}: {
  investigation: Investigation;
  /** Null while the form it opens is open. */
  onAsk: (() => void) | null;
  onOpenTicket: (id: number) => void;
}): ReactElement {
  const { ticketId } = investigation;
  const answered = investigation.status === 'succeeded';
  return (
    <>
      {ticketId === null ? null : (
        <Button
          onClick={() => {
            onOpenTicket(ticketId);
          }}
        >
          Open ticket
        </Button>
      )}
      {answered && onAsk && !writing(investigation) ? (
        <Button variant="primary" onClick={onAsk}>
          {ticketId === null ? 'Write a ticket from it' : 'Write another ticket'}
        </Button>
      ) : null}
    </>
  );
}

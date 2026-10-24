// Turns the investigation into a backlog ticket written by an agent, and links to it once made.
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['investigations'] }),
  });
  return (
    <div className="space-y-2">
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

/** Turns the investigation into a backlog ticket written by an agent, and links to it once made. */
export function InvestigationTicket({
  investigation,
  targets,
  onOpenTicket,
}: {
  investigation: Investigation;
  targets: IntegrationKindName[];
  onOpenTicket: (id: number) => void;
}): ReactElement {
  const [asking, setAsking] = useState(false);
  const { ticketStatus, ticketId, ticketError } = investigation;
  if (ticketStatus === 'queued' || ticketStatus === 'running') {
    return <p className="text-sm text-blue-700 dark:text-blue-300">Writing the ticket…</p>;
  }
  if (asking) {
    return (
      <Ask
        investigation={investigation}
        targets={targets}
        onCancel={() => {
          setAsking(false);
        }}
      />
    );
  }
  return (
    <div className="space-y-2">
      <TicketError status={ticketStatus} error={ticketError} />
      <div className="flex flex-wrap items-center gap-2">
        {ticketId === null ? null : (
          <Button
            variant="primary"
            onClick={() => {
              onOpenTicket(ticketId);
            }}
          >
            Open ticket
          </Button>
        )}
        <Button
          onClick={() => {
            setAsking(true);
          }}
        >
          {ticketId === null ? 'Create ticket' : 'Create another ticket'}
        </Button>
      </div>
    </div>
  );
}

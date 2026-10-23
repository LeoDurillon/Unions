// One investigation: its questions, the latest answer, the agent's live log and a follow-up form.
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import type { Investigation } from '@union/core';
import type { ReactElement } from 'react';

import { api } from '../../lib/api';
import { MODEL_LABELS } from '../agents/agent-labels';
import { Badge, Button, ErrorText } from '../ui';
import { isActive, SCOPE_LABELS, STATUS_LABELS } from './investigation-labels';
import { InvestigationTabs } from './investigation-tabs';
import { EarlierExchanges, LatestQuestion, NextSteps } from './investigation-thread';

function useInvestigationActions(
  investigation: Investigation,
  onDeleted: () => void,
): {
  cancel: UseMutationResult<unknown, Error, void>;
  rerun: UseMutationResult<unknown, Error, void>;
  remove: UseMutationResult<unknown, Error, void>;
} {
  const queryClient = useQueryClient();
  const refresh = (): Promise<void> =>
    queryClient.invalidateQueries({ queryKey: ['investigations'] });
  const cancel = useMutation({
    mutationFn: () => api.cancelInvestigation(investigation),
    onSuccess: refresh,
  });
  const rerun = useMutation({
    mutationFn: () => api.rerunInvestigation(investigation),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: () => api.deleteInvestigation(investigation),
    onSuccess: async () => {
      await refresh();
      onDeleted();
    },
  });
  return { cancel, rerun, remove };
}

function Actions({
  investigation,
  onDeleted,
}: {
  investigation: Investigation;
  onDeleted: () => void;
}): ReactElement {
  const { status } = investigation;
  const { cancel, rerun, remove } = useInvestigationActions(investigation, onDeleted);
  const busy = cancel.isPending || rerun.isPending || remove.isPending;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {isActive(status) ? (
          <Button
            disabled={busy}
            onClick={() => {
              cancel.mutate();
            }}
          >
            Cancel
          </Button>
        ) : (
          <Button
            disabled={busy}
            onClick={() => {
              rerun.mutate();
            }}
          >
            Run again
          </Button>
        )}
        {status === 'running' ? null : (
          <Button
            variant="danger"
            disabled={busy}
            onClick={() => {
              remove.mutate();
            }}
          >
            Delete
          </Button>
        )}
      </div>
      <ErrorText error={cancel.error ?? rerun.error ?? remove.error} />
    </div>
  );
}

/** One investigation: its questions, the latest answer, the agent's live log and a follow-up form. */
export function InvestigationDetail({
  investigation,
  hasNotion,
  onDeleted,
  onOpenTicket,
}: {
  investigation: Investigation;
  /** The project has a Notion data source: the ticket can be created there too. */
  hasNotion: boolean;
  onDeleted: () => void;
  onOpenTicket: (id: number) => void;
}): ReactElement {
  const status = STATUS_LABELS[investigation.status];
  return (
    <article className="space-y-4">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold">{investigation.title}</h3>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
        <p className="text-xs text-zinc-500">
          {SCOPE_LABELS[investigation.scope].title} · {MODEL_LABELS[investigation.model]} ·{' '}
          {investigation.tools.join(', ')}
        </p>
        <Actions investigation={investigation} onDeleted={onDeleted} />
      </header>
      <EarlierExchanges investigation={investigation} />
      <LatestQuestion investigation={investigation} />
      <InvestigationTabs investigation={investigation} />
      {investigation.status === 'succeeded' ? (
        <NextSteps
          investigation={investigation}
          hasNotion={hasNotion}
          onOpenTicket={onOpenTicket}
        />
      ) : null}
    </article>
  );
}

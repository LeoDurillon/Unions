import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import type { Investigation } from '@union/core';
import { useState, type ReactElement } from 'react';

import { api } from '../../lib/api';
import { MODEL_LABELS } from '../agents/agent-labels';
import { AgentLog } from '../log-tab';
import { Markdown } from '../markdown';
import { Badge, Button, ErrorText } from '../ui';
import { isActive, SCOPE_LABELS, STATUS_LABELS } from './investigation-labels';
import { EarlierExchanges, LatestQuestion, NextSteps } from './investigation-thread';

type Tab = 'result' | 'log';

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

function TabButton({
  tab,
  current,
  label,
  onSelect,
}: {
  tab: Tab;
  current: Tab;
  label: string;
  onSelect: (tab: Tab) => void;
}): ReactElement {
  const on = tab === current;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={on}
      onClick={() => {
        onSelect(tab);
      }}
      className={`border-b-2 px-3 py-1.5 text-sm ${on ? 'border-indigo-500 font-medium' : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'}`}
    >
      {label}
    </button>
  );
}

function Answer({ investigation }: { investigation: Investigation }): ReactElement {
  if (investigation.error !== null) {
    return (
      <p className="rounded-md bg-red-50 p-3 text-sm whitespace-pre-wrap text-red-800 dark:bg-red-950/40 dark:text-red-300">
        {investigation.error}
      </p>
    );
  }
  if (investigation.result !== null) {
    return <Markdown>{investigation.result}</Markdown>;
  }
  const waiting = isActive(investigation.status) ? 'The agent is still working: see the Log.' : '';
  return <p className="text-sm text-zinc-500">No answer. {waiting}</p>;
}

/** One investigation: its questions, the latest answer, the agent's live log and a follow-up form. */
export function InvestigationDetail({
  investigation,
  onDeleted,
  onOpenTicket,
}: {
  investigation: Investigation;
  onDeleted: () => void;
  onOpenTicket: (id: number) => void;
}): ReactElement {
  // Remounted on every status change (see the key in the page): running shows the log, done the answer.
  const [tab, setTab] = useState<Tab>(isActive(investigation.status) ? 'log' : 'result');
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
      <div role="tablist" className="flex border-b border-zinc-200 dark:border-zinc-800">
        <TabButton tab="result" current={tab} label="Answer" onSelect={setTab} />
        <TabButton tab="log" current={tab} label="Log" onSelect={setTab} />
      </div>
      {tab === 'result' ? (
        <Answer investigation={investigation} />
      ) : (
        <AgentLog source={{ investigation: investigation.id }} />
      )}
      {investigation.status === 'succeeded' ? (
        <NextSteps investigation={investigation} onOpenTicket={onOpenTicket} />
      ) : null}
    </article>
  );
}

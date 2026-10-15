import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactElement } from 'react';

import type { TicketDetail } from '../../src/api-types';
import { api } from '../lib/api';
import { DetailRow } from './detail-row';
import { Button, ErrorText, inputClass } from './ui';

const ROW_ON = 'bg-indigo-50 text-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-100';
const ROW_OFF = 'hover:bg-zinc-100 dark:hover:bg-zinc-800';
const BRANCHES_STALE_MS = 60_000;

const REASONS = {
  chosen: 'chosen',
  parent: "the parent's branch",
  project: 'project default',
} as const;

/** The repository's branches under a filter box; a name typed that is not listed can be used too. */
function BranchPicker({
  ticketId,
  value,
  onPick,
}: {
  ticketId: number;
  value: string | null;
  onPick: (branch: string) => void;
}): ReactElement {
  const [filter, setFilter] = useState('');
  const listed = useQuery({
    queryKey: ['branches', ticketId],
    queryFn: () => api.branches(ticketId),
    staleTime: BRANCHES_STALE_MS,
  });
  const needle = filter.trim();
  const branches = (listed.data?.branches ?? []).filter((branch) =>
    branch.toLowerCase().includes(needle.toLowerCase()),
  );
  const typed = needle !== '' && !branches.includes(needle) ? [needle] : [];
  return (
    <div className="space-y-1">
      <input
        aria-label="Filter branches"
        className={inputClass}
        value={filter}
        placeholder="Filter branches…"
        onChange={(event) => {
          setFilter(event.target.value);
        }}
      />
      <ErrorText error={listed.error} />
      <fieldset
        aria-label="Base branch"
        className="max-h-56 overflow-y-auto rounded-md border border-zinc-300 dark:border-zinc-700"
      >
        {listed.isPending ? <p className="px-3 py-2 text-sm text-zinc-500">Loading…</p> : null}
        {[...typed, ...branches].map((branch) => (
          <label
            key={branch}
            className={`block cursor-pointer px-3 py-1.5 font-mono text-xs has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-indigo-500 has-[:focus-visible]:ring-inset ${branch === value ? ROW_ON : ROW_OFF}`}
          >
            <input
              type="radio"
              name="base-branch"
              className="sr-only"
              checked={branch === value}
              onChange={() => {
                onPick(branch);
              }}
            />
            {typed.includes(branch) ? `Use "${branch}"` : branch}
          </label>
        ))}
      </fieldset>
    </div>
  );
}

/** What the chosen branch changes: the parent's branch is not used, the issue may stay open. */
function ChosenNotes({ detail }: { detail: TicketDetail }): ReactElement {
  return (
    <p className="text-xs text-zinc-500">
      {detail.ticket.parent ? "Used instead of the parent's branch. " : ''}
      GitHub closes the issue on merge only when the pull request targets the repository&apos;s
      default branch.
    </p>
  );
}

/**
 * The branch the ticket starts from and why; before it starts, it can be chosen over the parent's
 * and the project's (Automatic goes back to them).
 */
export function BaseBranchRow({ detail }: { detail: TicketDetail }): ReactElement {
  const { ticket, base } = detail;
  const [picking, setPicking] = useState(false);
  const queryClient = useQueryClient();
  const change = useMutation({
    mutationFn: (branch: string | null) => api.setBaseBranch(ticket.id, branch),
    onSuccess: () => {
      setPicking(false);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['ticket'] }),
  });
  return (
    <DetailRow label="Base branch" hint="The branch the ticket starts from and its PR targets">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <code className="text-xs">{base.branch ?? "the parent's branch, once pushed"}</code>
          <span className="text-xs text-zinc-500">· {REASONS[base.reason]}</span>
          {base.fixed ? null : (
            <span className="ml-auto flex gap-1">
              {base.reason === 'chosen' ? (
                <Button
                  disabled={change.isPending}
                  onClick={() => {
                    change.mutate(null);
                  }}
                >
                  Automatic
                </Button>
              ) : null}
              <Button
                disabled={change.isPending}
                onClick={() => {
                  setPicking(!picking);
                }}
              >
                {picking ? 'Close' : 'Change'}
              </Button>
            </span>
          )}
        </div>
        {base.reason === 'chosen' ? <ChosenNotes detail={detail} /> : null}
        <ErrorText error={change.error} />
        {picking && !base.fixed ? (
          <BranchPicker
            ticketId={ticket.id}
            value={ticket.chosenBaseBranch}
            onPick={(branch) => {
              change.mutate(branch);
            }}
          />
        ) : null}
      </div>
    </DetailRow>
  );
}

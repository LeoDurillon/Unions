// The branch the ticket starts from and why; before it starts, it can be chosen over the parent's
// and the project's (Automatic goes back to them).
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactElement } from 'react';

import type { TicketDetail } from '../../src/api-types';
import { api } from '../lib/api';
import { BranchPicker } from './branch-picker';
import { DetailRow } from './detail-row';
import { Button, ErrorText } from './ui';

const REASONS = {
  chosen: 'chosen',
  parent: "the parent's branch",
  project: 'project default',
} as const;

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

function FixedNote(): ReactElement {
  return (
    <p className="text-xs text-zinc-500">
      Fixed since the ticket started: Change target in the PR tab moves it onto another branch.
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
        {base.fixed && ticket.prState === 'open' ? <FixedNote /> : null}
        <ErrorText error={change.error} />
        {picking && !base.fixed ? (
          <BranchPicker
            label="Base branch"
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

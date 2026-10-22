// Change target: the finished ticket's own commits moved onto another branch, and its pull request retargeted there.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactElement } from 'react';

import type { TicketDetail } from '../../../src/api-types';
import { api } from '../../lib/api';
import { BranchPicker } from '../branch-picker';
import { Button, ErrorText } from '../ui';
import { canRewrite } from './branch-status';

function useRetarget(
  ticketId: number,
  onQueued: () => void,
): ReturnType<typeof useMutation<unknown, Error, string>> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (branch: string) => api.retarget(ticketId, branch),
    onSuccess: onQueued,
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['ticket', ticketId] }),
        queryClient.invalidateQueries({ queryKey: ['tickets'] }),
      ]),
  });
}

/** The new target, picked first, then confirmed: the branch is force-pushed. */
function TargetPicker({
  ticketId,
  base,
  pending,
  onRetarget,
}: {
  ticketId: number;
  base: string;
  pending: boolean;
  onRetarget: (branch: string) => void;
}): ReactElement {
  const [target, setTarget] = useState<string | null>(null);
  return (
    <>
      <BranchPicker label="New target" ticketId={ticketId} value={target} onPick={setTarget} />
      <Button
        disabled={target === null || target === base || pending}
        onClick={() => {
          if (target !== null) {
            onRetarget(target);
          }
        }}
      >
        {target === null ? 'Pick a branch' : `Retarget onto ${target}`}
      </Button>
    </>
  );
}

/** Shown while the pull request is open (not for a stack); usable at the final review or once done. */
export function ChangeTarget({ detail }: { detail: TicketDetail }): ReactElement | null {
  const { ticket, project } = detail;
  const [picking, setPicking] = useState(false);
  const retarget = useRetarget(ticket.id, () => {
    setPicking(false);
  });
  if (ticket.branch === null || ticket.prState !== 'open' || ticket.stack) {
    return null;
  }
  const allowed = canRewrite(detail);
  const base = ticket.baseBranch ?? project.config.baseBranch;
  return (
    <div className="space-y-2 rounded-md border border-zinc-200 p-3 text-sm dark:border-zinc-800">
      <div className="flex flex-wrap items-center gap-3">
        <span>
          Targets <code>{base}</code>
        </span>
        <Button
          disabled={!allowed || retarget.isPending}
          title={allowed ? undefined : 'Available at the final review, or once done'}
          onClick={() => {
            setPicking(!picking);
          }}
        >
          {picking ? 'Close' : 'Change target'}
        </Button>
      </div>
      <p className="text-xs text-zinc-500">
        Only this ticket&apos;s commits move onto the new branch (git rebases them and the checks
        run), then it is force-pushed and the pull request targets it. The implementation agent is
        called only for conflicts or failing checks, and then the final review runs again. On
        failure the branch is left as it was.
      </p>
      {picking && allowed ? (
        <TargetPicker
          ticketId={ticket.id}
          base={base}
          pending={retarget.isPending}
          onRetarget={(branch) => {
            retarget.mutate(branch);
          }}
        />
      ) : null}
      <ErrorText error={retarget.error} />
    </div>
  );
}

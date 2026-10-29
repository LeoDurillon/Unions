// The project's end-to-end tests against the preview, run when the user asks (a browser and a whole
// environment take a lot of memory): never on their own.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ReactElement } from 'react';

import type { PreviewView } from '../../src/api-types';
import { previewCalls, previewKey, type PreviewTarget } from '../lib/preview-target';
import { Details, LastResult } from './preview-e2e-result';
import { ReviewE2eActions } from './pull-requests/review-e2e-actions';
import { TicketE2eActions } from './ticket-e2e-actions';
import { Button, ErrorText } from './ui';

/**
 * The project's end-to-end tests against the preview, run when the user asks (a browser and a
 * whole environment take a lot of memory): never on their own. A ticket's failure can go to the
 * agent as a revision, a pull request's result to the review as a comment.
 */
export function PreviewE2e({
  target,
  view,
  canRevise,
}: {
  target: PreviewTarget;
  view: PreviewView;
  canRevise: boolean;
}): ReactElement | null {
  const queryClient = useQueryClient();
  const run = useMutation({
    mutationFn: previewCalls(target).e2e,
    onSuccess: (next) => {
      queryClient.setQueryData(previewKey(target), next);
    },
  });
  const { preview, e2eCommand } = view;
  if (!e2eCommand) {
    return null;
  }
  const stale = view.e2eStale;
  return (
    <div className="space-y-2 border-t border-zinc-200 pt-2 dark:border-zinc-800">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">End-to-end tests</span>
        {preview ? (
          <LastResult
            preview={preview}
            shotsWhere={target.kind === 'ticket' ? "in the ticket's files" : 'linked beside'}
          />
        ) : null}
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <Button
            disabled={run.isPending || view.e2eRefusal !== null}
            title={view.e2eRefusal ?? undefined}
            onClick={() => {
              run.mutate();
            }}
          >
            {preview?.e2eStatus ? 'Run again' : 'Run e2e tests'}
          </Button>
          {target.kind === 'ticket' ? (
            <TicketE2eActions
              ticketId={target.ticketId}
              command={e2eCommand}
              preview={preview}
              canRevise={canRevise && stale === null}
            />
          ) : (
            <ReviewE2eActions target={target} />
          )}
        </span>
      </div>
      <Details command={e2eCommand} preview={preview} stale={stale} />
      <ErrorText error={run.error} />
    </div>
  );
}

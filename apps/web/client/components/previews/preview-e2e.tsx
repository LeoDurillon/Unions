// The project's end-to-end tests against the preview, run only when the user asks, never on their
// own. A browser and a whole environment take a lot of memory.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ReactElement } from 'react';

import type { PreviewView } from '../../../src/api-types';
import { previewCalls, previewKey, type PreviewTarget } from '../../lib/preview/preview-target';
import { ReviewE2eActions } from '../pull-requests/review-e2e-actions';
import { Button, CARD_CLASS, ErrorText } from '../ui/ui';
import { Details, LastResult } from './preview-e2e-result';
import { TicketE2eActions } from './ticket-e2e-actions';

/** The card's title, and why the tests cannot run now under it. */
function E2eTitle({ refusal }: { refusal: string | null }): ReactElement {
  return (
    <div className="min-w-0 flex-1 space-y-0.5">
      <h3 className="text-sm font-semibold">End-to-end tests</h3>
      {refusal ? <p className="text-xs text-zinc-500">{refusal}</p> : null}
    </div>
  );
}

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
    <section className={CARD_CLASS}>
      <div className="flex flex-wrap items-center gap-2">
        <E2eTitle refusal={view.e2eRefusal} />
        {preview ? (
          <LastResult
            preview={preview}
            shotsWhere={target.kind === 'ticket' ? "in the ticket's files" : 'linked beside'}
          />
        ) : null}
        <span className="flex flex-wrap items-center gap-2">
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
    </section>
  );
}

// The project's end-to-end tests against the preview, run when the user asks (a browser and a whole
// environment take a lot of memory): never on their own.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Preview } from '@union/core';
import type { ReactElement } from 'react';

import type { PreviewView } from '../../src/api-types';
import type { Tone } from '../lib/labels';
import { previewCalls, previewKey, type PreviewTarget } from '../lib/preview-target';
import { ReviewE2eActions } from './pull-requests/review-e2e-actions';
import { TicketE2eActions } from './ticket-e2e-actions';
import { Badge, Button, ErrorText } from './ui';

const STATUS: Record<NonNullable<Preview['e2eStatus']>, { label: string; tone: Tone }> = {
  running: { label: 'Running…', tone: 'blue' },
  green: { label: 'Passing', tone: 'green' },
  red: { label: 'Failing', tone: 'red' },
  skipped: { label: 'Not run', tone: 'neutral' },
};

function LastRun({
  preview,
  shotsWhere,
}: {
  preview: Preview;
  shotsWhere: string;
}): ReactElement | null {
  if (!preview.e2eStatus) {
    return null;
  }
  const status = STATUS[preview.e2eStatus];
  const shots = preview.e2eScreenshots ?? 0;
  return (
    <div className="space-y-1 text-xs">
      <p className="flex items-center gap-2">
        <Badge tone={status.tone}>{status.label}</Badge>
        {preview.e2eAt ? (
          <span className="text-zinc-500">{new Date(preview.e2eAt).toLocaleString()}</span>
        ) : null}
        {shots > 0 ? (
          <span className="text-zinc-500">
            {shots} failure screenshot(s) {shotsWhere}
          </span>
        ) : null}
      </p>
      {preview.e2eOutput ? (
        <details open={preview.e2eStatus !== 'green'}>
          <summary className="cursor-pointer text-zinc-500">Output</summary>
          <pre className="mt-1 max-h-72 overflow-auto rounded-md bg-zinc-950 p-2 whitespace-pre-wrap text-zinc-100">
            {preview.e2eOutput}
          </pre>
        </details>
      ) : null}
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
  return (
    <div className="space-y-2 border-t border-zinc-200 pt-2 dark:border-zinc-800">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">End-to-end tests</span>
        <code className="text-xs text-zinc-500">{e2eCommand}</code>
        <Button
          disabled={run.isPending || view.e2eRefusal !== null}
          title={view.e2eRefusal ?? undefined}
          onClick={() => {
            run.mutate();
          }}
        >
          Run e2e tests
        </Button>
        {target.kind === 'ticket' ? (
          <TicketE2eActions
            ticketId={target.ticketId}
            command={e2eCommand}
            preview={preview}
            canRevise={canRevise}
          />
        ) : (
          <ReviewE2eActions target={target} />
        )}
      </div>
      {preview ? (
        <LastRun
          preview={preview}
          shotsWhere={target.kind === 'ticket' ? "in the ticket's files" : 'linked above'}
        />
      ) : null}
      <ErrorText error={run.error} />
    </div>
  );
}

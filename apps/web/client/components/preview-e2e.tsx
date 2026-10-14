import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Preview } from '@union/core';
import type { ReactElement } from 'react';

import type { PreviewView } from '../../src/api-types';
import { api } from '../lib/api';
import type { Tone } from '../lib/labels';
import { previewApi } from '../lib/preview-api';
import { Badge, Button, ErrorText } from './ui';

const STATUS: Record<NonNullable<Preview['e2eStatus']>, { label: string; tone: Tone }> = {
  running: { label: 'Running…', tone: 'blue' },
  green: { label: 'Passing', tone: 'green' },
  red: { label: 'Failing', tone: 'red' },
  skipped: { label: 'Not run', tone: 'neutral' },
};

/** The revision a red run becomes: what failed, as the agent gets a failing check. */
function failureFeedback(command: string, preview: Preview): string {
  const shots =
    (preview.e2eScreenshots ?? 0) > 0
      ? '\n\nScreenshots of the failures are in the attachments folder (e2e-*.png).'
      : '';
  return `The end-to-end tests failed: \`${command}\` exited with ${preview.e2eExitCode ?? '?'}. Last lines:\n\n\`\`\`\n${preview.e2eOutput ?? ''}\n\`\`\`${shots}\n\nFix the cause; run the failing tests against the preview before finishing.`;
}

function LastRun({ preview }: { preview: Preview }): ReactElement | null {
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
            {shots} failure screenshot(s) in the ticket&apos;s files
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
 * The project's end-to-end tests against the ticket's preview, run when the user asks (a browser
 * and a whole environment take a lot of memory): never on their own. A failure can go to the agent
 * as a revision.
 */
export function PreviewE2e({
  ticketId,
  view,
  canRevise,
}: {
  ticketId: number;
  view: PreviewView;
  canRevise: boolean;
}): ReactElement | null {
  const queryClient = useQueryClient();
  const run = useMutation({
    mutationFn: () => previewApi.e2e(ticketId),
    onSuccess: (next) => {
      queryClient.setQueryData(['ticket', ticketId, 'preview'], next);
    },
  });
  const revise = useMutation({
    mutationFn: (feedback: string) => api.command(ticketId, 'revise', { feedback }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['ticket', ticketId] }),
  });
  const { preview, e2eCommand } = view;
  if (!e2eCommand) {
    return null;
  }
  const red = preview?.e2eStatus === 'red' ? preview : null;
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
        {red && canRevise ? (
          <Button
            variant="primary"
            disabled={revise.isPending}
            onClick={() => {
              revise.mutate(failureFeedback(e2eCommand, red));
            }}
          >
            Send the failure to the agent
          </Button>
        ) : null}
      </div>
      {preview ? <LastRun preview={preview} /> : null}
      <ErrorText error={run.error ?? revise.error} />
    </div>
  );
}

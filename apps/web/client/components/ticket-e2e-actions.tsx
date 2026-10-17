// What a ticket's failing end-to-end run can become: a revision the implementer gets, like a failing check.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Preview } from '@union/core';
import type { ReactElement } from 'react';

import { api } from '../lib/api';
import { Button, ErrorText } from './ui';

/** The revision a red run becomes: what failed, as the agent gets a failing check. */
function failureFeedback(command: string, preview: Preview): string {
  const shots =
    (preview.e2eScreenshots ?? 0) > 0
      ? '\n\nScreenshots of the failures are in the attachments folder (e2e-*.png).'
      : '';
  return `The end-to-end tests failed: \`${command}\` exited with ${preview.e2eExitCode ?? '?'}. Last lines:\n\n\`\`\`\n${preview.e2eOutput ?? ''}\n\`\`\`${shots}\n\nFix the cause; run the failing tests against the preview before finishing.`;
}

/** "Send the failure to the agent", once a run failed and the ticket can go back to it. */
export function TicketE2eActions({
  ticketId,
  command,
  preview,
  canRevise,
}: {
  ticketId: number;
  command: string | null;
  preview: Preview | null;
  canRevise: boolean;
}): ReactElement | null {
  const queryClient = useQueryClient();
  const revise = useMutation({
    mutationFn: (feedback: string) => api.command(ticketId, 'revise', { feedback }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['ticket', ticketId] }),
  });
  if (!command || preview?.e2eStatus !== 'red' || !canRevise) {
    return null;
  }
  return (
    <>
      <Button
        variant="primary"
        disabled={revise.isPending}
        onClick={() => {
          revise.mutate(failureFeedback(command, preview));
        }}
      >
        Send the failure to the agent
      </Button>
      <ErrorText error={revise.error} />
    </>
  );
}

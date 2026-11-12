// The Usage tab's "Suggest improvements": asks first, then queues the investigation and opens it.
// It asks because it runs an agent on the Claude subscription.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { INVESTIGATION_DEFAULTS } from '@union/core/investigation-defaults';
import { useState, type ReactElement } from 'react';

import { request } from '../../lib/api';
import { openInvestigation } from '../../lib/opened-investigation';
import type { UsageRange } from '../../lib/use-usage';
import { Button, ErrorText } from '../ui';

export function SuggestImprovements({
  projectId,
  range,
}: {
  projectId: number;
  range: UsageRange;
}): ReactElement {
  const queryClient = useQueryClient();
  const [asking, setAsking] = useState(false);
  const suggest = useMutation({
    mutationFn: (): Promise<{ id: number }> =>
      request('POST', `/api/projects/${projectId}/usage/suggestions?days=${range}`),
    onSuccess: async ({ id }) => {
      await queryClient.invalidateQueries({ queryKey: ['investigations'] });
      openInvestigation(id);
    },
  });
  if (!asking) {
    return (
      <Button
        size="sm"
        onClick={() => {
          setAsking(true);
        }}
      >
        Suggest improvements
      </Button>
    );
  }
  return (
    <div className="flex max-w-md flex-wrap items-center gap-2 text-xs">
      <span className="text-zinc-600 dark:text-zinc-400">
        An agent ({INVESTIGATION_DEFAULTS.model}) reads the repository and these findings, and
        answers with changes to make. It runs on your Claude subscription, as an investigation.
      </span>
      <Button
        size="sm"
        variant="primary"
        disabled={suggest.isPending}
        onClick={() => {
          suggest.mutate();
        }}
      >
        Start
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          setAsking(false);
        }}
      >
        Cancel
      </Button>
      <ErrorText error={suggest.error} />
    </div>
  );
}

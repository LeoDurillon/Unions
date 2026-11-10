// Starts the setup agent again: the model to run with, and a Start that says it uses the Claude subscription.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AgentModel } from '@union/core';
import { useState, type ReactElement } from 'react';

import { setupApi } from '../../lib/setup-api';
import { ModelField } from '../agents/model-field';
import { Button, ErrorText } from '../ui';

export function SetupStart({
  projectId,
  model: initial,
}: {
  projectId: number;
  /** The model the last run used. */
  model: AgentModel;
}): ReactElement {
  const queryClient = useQueryClient();
  const [model, setModel] = useState(initial);
  const start = useMutation({
    mutationFn: () => setupApi.start(projectId, model),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['investigations'] }),
  });
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <ModelField model={model} onChange={setModel} />
        <Button
          size="sm"
          disabled={start.isPending}
          onClick={() => {
            start.mutate();
          }}
        >
          Run setup
        </Button>
        <span className="text-xs text-zinc-500">Uses your Claude subscription.</span>
      </div>
      <ErrorText error={start.error} />
    </div>
  );
}

import { useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';

import { api } from '../../lib/api';
import { ErrorText } from '../ui';
import { AgentCard } from './agent-card';

export function AgentsPage(): ReactElement {
  const agents = useQuery({ queryKey: ['agents'], queryFn: api.agents });
  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <header className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <h2 className="text-base font-semibold">Agent settings</h2>
        <p className="text-xs text-zinc-500">
          Prompts and models used by every project. Changes apply to the next run of each step.
        </p>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl space-y-4 p-4">
          <ErrorText error={agents.error} />
          {(agents.data ?? []).map((config) => (
            <AgentCard
              key={`${config.agent}:${String(config.customized)}:${config.model ?? ''}:${config.prompt}`}
              config={config}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

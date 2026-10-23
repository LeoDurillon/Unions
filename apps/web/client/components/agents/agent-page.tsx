// One agent's prompt, model, effort and tools, with one Save; the next run of that step uses them.
import { useQuery } from '@tanstack/react-query';
import type { AgentId } from '@union/core';
import { useState, type ReactElement } from 'react';

import { api } from '../../lib/api';
import { ErrorText } from '../ui';
import { AgentForm } from './agent-form';
import { CustomAgentDanger } from './custom-agent-card';

/** One agent's prompt, model, effort and tools, with one Save; the next run of that step uses them. */
export function AgentPage({ agent }: { agent: AgentId }): ReactElement {
  const agents = useQuery({ queryKey: ['agents'], queryFn: api.agents });
  // A reset replaces what was saved: the form starts again from the defaults.
  const [resets, setResets] = useState(0);
  const config = agents.data?.find((entry) => entry.agent === agent);
  if (config === undefined) {
    return agents.data ? (
      <p className="text-sm text-zinc-500">This agent does not exist, or was deleted.</p>
    ) : (
      <ErrorText error={agents.error} />
    );
  }
  return (
    <div className="space-y-6">
      <AgentForm
        // A new prompt from the writer starts the form again from it.
        key={`${resets}-${config.defaultPrompt}`}
        config={config}
        onReset={() => {
          setResets((count) => count + 1);
        }}
      />
      <CustomAgentDanger config={config} />
    </div>
  );
}

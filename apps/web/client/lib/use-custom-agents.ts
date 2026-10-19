// The custom agents as the ticket views and flow pickers need them: names by step, and the ones a flow can add.
import { useQuery } from '@tanstack/react-query';
import type { CustomAgentNames } from '@union/core';
import { isCustomStep, type CustomStep } from '@union/core/states';

import { api } from './api';
import { customAgentsApi } from './custom-agents-api';

export type CustomAgentChoice = { step: CustomStep; name: string };

const NONE: CustomAgentNames = {};

/** Every custom agent's name by step, deleted ones included; empty until loaded. */
export function useCustomAgentNames(): CustomAgentNames {
  // Refetched with the agents: a new or renamed one is named at once.
  return useQuery({ queryKey: ['agents', 'names'], queryFn: customAgentsApi.names }).data ?? NONE;
}

/** The live agents whose prompt is written: the only ones a flow may name. */
export function useFlowAgents(): CustomAgentChoice[] {
  const agents = useQuery({ queryKey: ['agents'], queryFn: api.agents }).data ?? [];
  return agents.flatMap((agent) =>
    isCustomStep(agent.agent) && agent.custom && agent.defaultPrompt !== ''
      ? [{ step: agent.agent, name: agent.custom.name }]
      : [],
  );
}

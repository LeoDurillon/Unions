// A custom agent's defaults (its written prompt, Sonnet, the tools of its kind) and what its settings page shows of it.

import { CUSTOM_AGENT_TOOLS, REVIEW_AGENT_TOOLS } from '../agent/agent-tools';
import type { Db } from '../db';
import { customAgentId, type AgentModel, type CustomStep } from '../states';
import { findCustomAgent, type CustomAgent } from './custom-agents';

/** What a custom agent's page shows beside the prompt, model and tools every agent has. */
export type CustomAgentInfo = Pick<
  CustomAgent,
  'id' | 'name' | 'role' | 'kind' | 'promptStatus' | 'promptError' | 'deletedAt'
>;

const CUSTOM_AGENT_MODEL: AgentModel = 'sonnet';

export type CustomAgentDefaults = {
  prompt: string;
  model: AgentModel;
  tools: readonly string[];
  custom: CustomAgentInfo | null;
};

/** The defaults of `step`; an agent not found (a hand edit) has an empty prompt. */
export function customAgentDefaults(db: Db, step: CustomStep): CustomAgentDefaults {
  const agent = findCustomAgent(db, customAgentId(step));
  return {
    prompt: agent?.defaultPrompt ?? '',
    model: CUSTOM_AGENT_MODEL,
    tools: agent?.kind === 'review' ? REVIEW_AGENT_TOOLS : CUSTOM_AGENT_TOOLS,
    custom: agent
      ? {
          id: agent.id,
          name: agent.name,
          role: agent.role,
          kind: agent.kind,
          promptStatus: agent.promptStatus,
          promptError: agent.promptError,
          deletedAt: agent.deletedAt,
        }
      : null,
  };
}

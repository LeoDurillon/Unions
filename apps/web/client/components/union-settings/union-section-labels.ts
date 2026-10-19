// The names the Union settings menu shows: each agent's title, then the other pages'.
import type { AgentConfig, AgentId } from '@union/core';
import { isCustomStep } from '@union/core/states';

import type { UnionSection } from '../../lib/union-settings-groups';
import { AGENT_LABELS, isAgentId } from '../agents/agent-labels';

const OTHER_LABELS: Record<Exclude<UnionSection, AgentId>, string> = {
  models: 'Models',
  tools: 'Tools',
  connectors: 'Connectors',
  'github-app': 'GitHub App',
};

/** `agents`: the list the custom agents' names come from. */
export function unionSectionLabel(
  section: UnionSection,
  agents: readonly AgentConfig[] = [],
): string {
  if (isCustomStep(section)) {
    return agents.find((agent) => agent.agent === section)?.custom?.name ?? 'Custom agent';
  }
  return isAgentId(section) ? AGENT_LABELS[section].title : OTHER_LABELS[section];
}

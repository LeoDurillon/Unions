// The names the Union settings menu shows: each agent's title, then the other pages'.
import type { AgentId } from '@union/core';

import type { UnionSection } from '../../lib/union-settings-groups';
import { AGENT_LABELS, isAgentId } from '../agents/agent-labels';

const OTHER_LABELS: Record<Exclude<UnionSection, AgentId>, string> = {
  models: 'Models',
  tools: 'Tools',
  connectors: 'Connectors',
  'github-app': 'GitHub App',
};

export function unionSectionLabel(section: UnionSection): string {
  return isAgentId(section) ? AGENT_LABELS[section].title : OTHER_LABELS[section];
}

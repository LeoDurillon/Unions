// The Union settings menu: the shared instructions, All agents (and the agent page open), Tools and the GitHub App.

import type { AgentConfig } from '@union/core';
import { isCustomStep } from '@union/core/states';

import {
  UNION_SETTINGS_GROUPS,
  type UnionSection,
} from '../../lib/union-settings/union-settings-groups';
import { isAgentId } from '../agents/agent-labels';
import type { NavGroup } from '../settings/settings-nav';
import { unionSectionLabel } from './union-section-labels';

/** The groups after the agents, as they are. */
const AFTER_AGENTS = new Set(['Tools', 'GitHub']);

function entry(
  id: UnionSection,
  agents: readonly AgentConfig[],
): NavGroup<UnionSection>['sections'][number] {
  return { id, label: unionSectionLabel(id, agents) };
}

/**
 * The menu. Every agent, built-in or custom, is reached from **All agents** (its table links to each
 * page); the agent page open shows under it, so the menu says where you are.
 */
export function navGroups(
  agents: readonly AgentConfig[],
  open: UnionSection | null = null,
): NavGroup<UnionSection>[] {
  const isAgentPage = open !== null && open !== 'shared' && (isAgentId(open) || isCustomStep(open));
  const agentPage = open !== null && isAgentPage ? [entry(open, agents)] : [];
  return [
    {
      label: 'General',
      sections: [entry('shared', agents), entry('resources', agents), entry('system', agents)],
    },
    { label: 'Agents', sections: [entry('models', agents), ...agentPage] },
    ...UNION_SETTINGS_GROUPS.filter((group) => AFTER_AGENTS.has(group.label)).map((group) => ({
      label: group.label,
      sections: group.sections.map((id) => entry(id, agents)),
    })),
  ];
}

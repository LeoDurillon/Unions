// The Union settings menu's groups: the fixed pages, and the custom agents' group before Tools.
import type { AgentConfig } from '@union/core';

import { UNION_SETTINGS_GROUPS, type UnionSection } from '../../lib/union-settings-groups';
import type { NavGroup } from '../settings/settings-nav';
import { unionSectionLabel } from './union-section-labels';

/** The index of the Tools group: the custom agents' group goes before it, after the built-in agents. */
const TOOLS_GROUP = UNION_SETTINGS_GROUPS.findIndex((group) => group.label === 'Tools');

/** The fixed groups, with a "Custom agents" group of the live ones when there are some. */
export function navGroups(agents: readonly AgentConfig[]): NavGroup<UnionSection>[] {
  const groups: NavGroup<UnionSection>[] = UNION_SETTINGS_GROUPS.map((group) => ({
    label: group.label,
    sections: group.sections.map((id) => ({ id, label: unionSectionLabel(id) })),
  }));
  const custom = agents.flatMap((agent) =>
    agent.custom ? [{ id: agent.agent, label: agent.custom.name }] : [],
  );
  if (custom.length > 0) {
    groups.splice(TOOLS_GROUP, 0, { label: 'Custom agents', sections: custom });
  }
  return groups;
}

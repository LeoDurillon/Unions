// The Union settings menu's groups: the fixed pages, and the custom agents' and review agents' groups before Tools.
import type { AgentConfig, CustomAgentKind } from '@union/core';

import { UNION_SETTINGS_GROUPS, type UnionSection } from '../../lib/union-settings-groups';
import type { NavGroup } from '../settings/settings-nav';
import { unionSectionLabel } from './union-section-labels';

/** The index of the Tools group: the custom agents' group goes before it, after the built-in agents. */
const TOOLS_GROUP = UNION_SETTINGS_GROUPS.findIndex((group) => group.label === 'Tools');

/** The live custom agents of `kind`, as menu entries. */
function entriesOf(
  agents: readonly AgentConfig[],
  kind: CustomAgentKind,
): NavGroup<UnionSection>['sections'] {
  return agents.flatMap((agent) =>
    agent.custom?.kind === kind ? [{ id: agent.agent, label: agent.custom.name }] : [],
  );
}

/**
 * The fixed groups, with a "Custom agents" group of the ticket-step ones and a "Review agents" group,
 * each when it has some.
 */
export function navGroups(agents: readonly AgentConfig[]): NavGroup<UnionSection>[] {
  const groups: NavGroup<UnionSection>[] = UNION_SETTINGS_GROUPS.map((group) => ({
    label: group.label,
    sections: group.sections.map((id) => ({ id, label: unionSectionLabel(id) })),
  }));
  const added = [
    { label: 'Custom agents', sections: entriesOf(agents, 'step') },
    { label: 'Custom review agents', sections: entriesOf(agents, 'review') },
  ].filter((group) => group.sections.length > 0);
  groups.splice(TOOLS_GROUP, 0, ...added);
  return groups;
}

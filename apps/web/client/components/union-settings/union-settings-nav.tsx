// The Union settings menu: the fixed pages, the custom agents' group, and New agent.
import type { AgentConfig } from '@union/core';
import type { ReactElement } from 'react';

import type { UnionSection } from '../../lib/union-settings-groups';
import { openUnionSettings } from '../../lib/union-settings-sections';
import { SettingsNav } from '../settings/settings-nav';
import { NewAgentButton } from './new-agent-dialog';
import { navGroups } from './union-nav-groups';

export function UnionSettingsNav({
  agents,
  section,
}: {
  agents: readonly AgentConfig[];
  section: UnionSection;
}): ReactElement {
  return (
    <div className="space-y-3">
      <SettingsNav
        label="Union settings"
        groups={navGroups(agents)}
        section={section}
        onOpen={openUnionSettings}
      />
      <NewAgentButton className="ml-3" />
    </div>
  );
}

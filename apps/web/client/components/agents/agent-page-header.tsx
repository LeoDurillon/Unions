// The top of an agent page's card: whether it is customized, its model and effort, a custom agent's role.

import type { AgentConfig } from '@union/core';
import type { ReactElement } from 'react';

import type { AgentEdits } from '../../lib/union-settings/use-agent-form';
import { Badge } from '../ui/ui';
import { CustomAgentRole } from './custom-agent-card';
import { EffortField } from './effort-field';
import { ModelField } from './model-field';

/** Whether the agent is customized, its model and effort, and a custom agent's role. */
export function AgentPageHeader({
  config,
  edits,
  onChange,
}: {
  config: AgentConfig;
  edits: AgentEdits;
  onChange: (change: Partial<AgentEdits>) => void;
}): ReactElement {
  return (
    <header className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={config.customized ? 'blue' : 'neutral'}>
          {config.customized ? 'customized' : 'default'}
        </Badge>
        <div className="flex-1" />
        {edits.model === null ? null : (
          <>
            <ModelField
              model={edits.model}
              onChange={(model) => {
                onChange({ model });
              }}
            />
            <EffortField
              effort={edits.effort}
              onChange={(effort) => {
                onChange({ effort });
              }}
            />
          </>
        )}
      </div>
      <CustomAgentRole config={config} />
    </header>
  );
}

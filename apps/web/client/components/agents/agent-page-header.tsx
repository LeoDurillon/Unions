// An agent page's title, whether it is customized, its model and effort, and what it does.
import type { AgentConfig } from '@union/core';
import type { ReactElement } from 'react';

import type { AgentEdits } from '../../lib/use-agent-form';
import { Badge } from '../ui';
import { agentLabel } from './agent-labels';
import { CustomAgentRole } from './custom-agent-card';
import { EffortField } from './effort-field';
import { ModelField } from './model-field';

/** An agent page's title, whether it is customized, its model and effort, and what it does. */
export function AgentPageHeader({
  config,
  edits,
  onChange,
}: {
  config: AgentConfig;
  edits: AgentEdits;
  onChange: (change: Partial<AgentEdits>) => void;
}): ReactElement {
  const label = agentLabel(config);
  return (
    <header className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">{label.title}</h3>
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
      <p className="text-xs text-zinc-500">{label.description}</p>
      <CustomAgentRole config={config} />
    </header>
  );
}

// One agent's form on its page: the prompt, model, effort and tools, saved together, and Reset to default.
import type { AgentConfig } from '@union/core';
import type { ReactElement } from 'react';

import {
  invalidReason,
  useAgentForm,
  useResetAgent,
  type AgentEdits,
} from '../../lib/use-agent-form';
import { SaveBar } from '../settings/save-bar';
import { Button, ErrorText } from '../ui';
import { agentLabel } from './agent-labels';
import { AgentPageHeader } from './agent-page-header';
import { PromptField } from './prompt-field';
import { ToolsField } from './tools-field';

export function AgentForm({
  config,
  onReset,
}: {
  config: AgentConfig;
  onReset: () => void;
}): ReactElement {
  const form = useAgentForm(config);
  const reset = useResetAgent(config.agent, onReset);
  const edits = form.value;
  const change = (next: Partial<AgentEdits>): void => {
    form.set({ ...edits, ...next });
  };
  const { title } = agentLabel(config);
  return (
    <section className="space-y-3">
      <AgentPageHeader config={config} edits={edits} onChange={change} />
      <PromptField
        agent={config.agent}
        title={title}
        value={edits.prompt}
        onChange={(prompt) => {
          change({ prompt });
        }}
      />
      {edits.tools === null || config.defaultTools === null ? null : (
        <ToolsField
          agentTitle={title}
          value={edits.tools}
          defaults={config.defaultTools}
          onChange={(tools) => {
            change({ tools });
          }}
        />
      )}
      <ErrorText error={reset.error} />
      <SaveBar state={form} invalid={invalidReason(edits)}>
        {config.customized ? (
          <Button
            disabled={form.dirty || reset.isPending}
            title={form.dirty ? 'Save or discard your changes first' : undefined}
            onClick={() => {
              reset.mutate();
            }}
          >
            Reset to default
          </Button>
        ) : null}
      </SaveBar>
    </section>
  );
}

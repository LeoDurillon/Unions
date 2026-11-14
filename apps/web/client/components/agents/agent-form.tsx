// One agent's form on its page: the prompt, model, effort and tools, saved together, and Reset to default.

import type { AgentConfig } from '@union/core';
import { useEffect, type ReactElement } from 'react';

import {
  invalidReason,
  useAgentForm,
  useResetAgent,
  type AgentEdits,
} from '../../lib/union-settings/use-agent-form';
import { SaveBar } from '../settings/save-bar';
import { ConfirmButton } from '../ui/confirm-button';
import { ErrorText } from '../ui/ui';
import { agentLabel } from './agent-labels';
import { AgentPageHeader } from './agent-page-header';
import { PromptField } from './prompt-field';
import { ToolsField } from './tools-field';

/** Takes a new default prompt at once while nothing is edited; else says it waits. */
function NewDefault({
  newDefault,
  dirty,
  onTake,
}: {
  newDefault: boolean;
  dirty: boolean;
  onTake: () => void;
}): ReactElement | null {
  useEffect(() => {
    if (newDefault && !dirty) {
      onTake();
    }
  }, [newDefault, dirty, onTake]);
  return newDefault && dirty ? (
    <p className="text-sm text-amber-700 dark:text-amber-400">
      A new default prompt was written. Save or discard your changes to see it.
    </p>
  ) : null;
}

/**
 * `newDefault`: the prompt writer wrote a new default since the form started. Unedited, the form
 * takes it (`onTakeDefault`) at once; edited, it says so and takes it once saved or discarded.
 */
export function AgentForm({
  config,
  newDefault,
  onTakeDefault,
  onReset,
}: {
  config: AgentConfig;
  newDefault: boolean;
  onTakeDefault: () => void;
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
      <NewDefault newDefault={newDefault} dirty={form.dirty} onTake={onTakeDefault} />
      <ErrorText error={reset.error} />
      <SaveBar state={form} invalid={invalidReason(edits)}>
        {config.customized ? (
          <span title={form.dirty ? 'Save or discard your changes first' : undefined}>
            <ConfirmButton
              label="Reset to default"
              question="Reset to default? Your changes to this agent are lost."
              confirmLabel="Reset"
              disabled={form.dirty || reset.isPending}
              onConfirm={() => {
                reset.mutate();
              }}
            />
          </span>
        ) : null}
      </SaveBar>
    </section>
  );
}

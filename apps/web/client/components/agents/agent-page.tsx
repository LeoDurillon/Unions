import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AgentConfig, AgentId } from '@union/core';
import { useState, type ReactElement } from 'react';

import { api } from '../../lib/api';
import { invalidReason, useAgentForm, type AgentEdits } from '../../lib/use-agent-form';
import { SaveBar } from '../settings/save-bar';
import { Button, ErrorText, inputClass } from '../ui';
import { agentLabel } from './agent-labels';
import { AgentPageHeader } from './agent-page-header';
import { ToolsField } from './tools-field';

function AgentForm({
  config,
  onReset,
}: {
  config: AgentConfig;
  onReset: () => void;
}): ReactElement {
  const queryClient = useQueryClient();
  const form = useAgentForm(config);
  const reset = useMutation({
    mutationFn: () => api.resetAgent(config.agent),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['agents'] });
      onReset();
    },
  });
  const edits = form.value;
  const change = (next: Partial<AgentEdits>): void => {
    form.set({ ...edits, ...next });
  };
  const { title } = agentLabel(config);
  return (
    <section className="space-y-3">
      <AgentPageHeader config={config} edits={edits} onChange={change} />
      <textarea
        className={`${inputClass} min-h-96 font-mono text-xs`}
        aria-label={`${title} prompt`}
        value={edits.prompt}
        onChange={(event) => {
          change({ prompt: event.target.value });
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

/** One agent's prompt, model, effort and tools, with one Save; the next run of that step uses them. */
export function AgentPage({ agent }: { agent: AgentId }): ReactElement {
  const agents = useQuery({ queryKey: ['agents'], queryFn: api.agents });
  // A reset replaces what was saved: the form starts again from the defaults.
  const [resets, setResets] = useState(0);
  const config = agents.data?.find((entry) => entry.agent === agent);
  if (config === undefined) {
    return <ErrorText error={agents.error} />;
  }
  return (
    <AgentForm
      key={resets}
      config={config}
      onReset={() => {
        setResets((count) => count + 1);
      }}
    />
  );
}

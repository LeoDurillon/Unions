import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AgentConfig, AgentEffort, AgentModel } from '@union/core';
import { useState, type ReactElement } from 'react';

import { api } from '../../lib/api';
import { Badge, Button, ErrorText, inputClass } from '../ui';
import { AGENT_LABELS } from './agent-labels';
import { EffortField } from './effort-field';
import { ModelField } from './model-field';
import { ToolsField } from './tools-field';

function sameTools(a: string[] | null, b: string[] | null): boolean {
  return a?.join('\n') === b?.join('\n');
}

function useAgentEdits(config: AgentConfig): {
  prompt: string;
  model: AgentModel | null;
  effort: AgentEffort | null;
  tools: string[] | null;
  setPrompt: (value: string) => void;
  handleModel: (value: AgentModel) => void;
  handleEffort: (value: AgentEffort | null) => void;
  handleTools: (value: string[]) => void;
  dirty: boolean;
  handleDiscard: () => void;
} {
  const [prompt, setPrompt] = useState(config.prompt);
  const [model, setModel] = useState(config.model);
  const [effort, setEffort] = useState(config.effort);
  const [tools, setTools] = useState(config.tools);
  const dirty =
    prompt !== config.prompt ||
    model !== config.model ||
    effort !== config.effort ||
    !sameTools(tools, config.tools);
  const handleDiscard = (): void => {
    setPrompt(config.prompt);
    setModel(config.model);
    setEffort(config.effort);
    setTools(config.tools);
  };
  return {
    prompt,
    model,
    effort,
    tools,
    setPrompt,
    handleModel: setModel,
    handleEffort: setEffort,
    handleTools: setTools,
    dirty,
    handleDiscard,
  };
}

function CardHeader({
  config,
  model,
  effort,
  onModel,
  onEffort,
}: {
  config: AgentConfig;
  model: AgentModel | null;
  effort: AgentEffort | null;
  onModel: (value: AgentModel) => void;
  onEffort: (value: AgentEffort | null) => void;
}): ReactElement {
  const label = AGENT_LABELS[config.agent];
  return (
    <header className="flex flex-wrap items-center gap-2">
      <h3 className="font-semibold">{label.title}</h3>
      <Badge tone={config.customized ? 'blue' : 'neutral'}>
        {config.customized ? 'customized' : 'default'}
      </Badge>
      {label.notRunYet ? <Badge tone="amber">step not run yet</Badge> : null}
      <div className="flex-1" />
      {model === null ? null : (
        <>
          <ModelField model={model} onChange={onModel} />
          <EffortField effort={effort} onChange={onEffort} />
        </>
      )}
    </header>
  );
}

function CardActions({
  canSave,
  dirty,
  customized,
  busy,
  onSave,
  onDiscard,
  onReset,
}: {
  canSave: boolean;
  dirty: boolean;
  customized: boolean;
  busy: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onReset: () => void;
}): ReactElement {
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="primary" disabled={!canSave || busy} onClick={onSave}>
        Save
      </Button>
      {dirty ? <Button onClick={onDiscard}>Discard changes</Button> : null}
      {customized ? (
        <Button disabled={busy} onClick={onReset}>
          Reset to default
        </Button>
      ) : null}
    </div>
  );
}

/** One agent's prompt, model, effort and tools, saved to the database; the next run of that step uses them. */
export function AgentCard({ config }: { config: AgentConfig }): ReactElement {
  const queryClient = useQueryClient();
  const edits = useAgentEdits(config);
  const refresh = (): Promise<void> => queryClient.invalidateQueries({ queryKey: ['agents'] });
  const save = useMutation({
    mutationFn: () =>
      api.saveAgent(config.agent, {
        prompt: edits.prompt,
        model: edits.model,
        effort: edits.effort,
        // Unchanged default tools stay unsaved, so a later change of the defaults applies.
        tools: sameTools(edits.tools, config.defaultTools) ? null : edits.tools,
      }),
    onSuccess: refresh,
  });
  const reset = useMutation({ mutationFn: () => api.resetAgent(config.agent), onSuccess: refresh });
  const label = AGENT_LABELS[config.agent];

  return (
    <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <CardHeader
        config={config}
        model={edits.model}
        effort={edits.effort}
        onModel={edits.handleModel}
        onEffort={edits.handleEffort}
      />
      <p className="text-xs text-zinc-500">{label.description}</p>
      <textarea
        className={`${inputClass} min-h-48 font-mono text-xs`}
        aria-label={`${label.title} prompt`}
        value={edits.prompt}
        onChange={(event) => {
          edits.setPrompt(event.target.value);
        }}
      />
      {edits.tools === null || config.defaultTools === null ? null : (
        <ToolsField
          agentTitle={label.title}
          value={edits.tools}
          defaults={config.defaultTools}
          onChange={edits.handleTools}
        />
      )}
      <ErrorText error={save.error ?? reset.error} />
      <CardActions
        canSave={edits.dirty && edits.prompt.trim() !== '' && edits.tools?.length !== 0}
        dirty={edits.dirty}
        customized={config.customized}
        busy={save.isPending || reset.isPending}
        onSave={() => {
          save.mutate();
        }}
        onDiscard={edits.handleDiscard}
        onReset={() => {
          reset.mutate();
        }}
      />
    </section>
  );
}

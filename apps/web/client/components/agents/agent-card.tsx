import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AgentConfig, AgentModel } from '@union/core';
import { AGENT_MODELS, isAgentModel } from '@union/core/states';
import { useState, type ReactElement } from 'react';

import { api } from '../../lib/api';
import { Badge, Button, ErrorText, inputClass } from '../ui';
import { AGENT_LABELS, MODEL_LABELS } from './agent-labels';

function useAgentEdits(config: AgentConfig): {
  prompt: string;
  model: AgentModel | null;
  setPrompt: (value: string) => void;
  handleModel: (value: AgentModel) => void;
  dirty: boolean;
  handleDiscard: () => void;
} {
  const [prompt, setPrompt] = useState(config.prompt);
  const [model, setModel] = useState(config.model);
  const dirty = prompt !== config.prompt || model !== config.model;
  const handleDiscard = (): void => {
    setPrompt(config.prompt);
    setModel(config.model);
  };
  return { prompt, model, setPrompt, handleModel: setModel, dirty, handleDiscard };
}

function ModelField({
  model,
  onChange,
}: {
  model: AgentModel;
  onChange: (value: AgentModel) => void;
}): ReactElement {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-zinc-500">Model</span>
      <select
        className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        value={model}
        onChange={(event) => {
          const { value } = event.target;
          if (isAgentModel(value)) {
            onChange(value);
          }
        }}
      >
        {AGENT_MODELS.map((option) => (
          <option key={option} value={option}>
            {MODEL_LABELS[option]}
          </option>
        ))}
      </select>
    </label>
  );
}

/** One agent's prompt and model, saved to the database; the next run of that step uses them. */
export function AgentCard({ config }: { config: AgentConfig }): ReactElement {
  const queryClient = useQueryClient();
  const edits = useAgentEdits(config);
  const refresh = (): Promise<void> => queryClient.invalidateQueries({ queryKey: ['agents'] });
  const save = useMutation({
    mutationFn: () => api.saveAgent(config.agent, { prompt: edits.prompt, model: edits.model }),
    onSuccess: refresh,
  });
  const reset = useMutation({ mutationFn: () => api.resetAgent(config.agent), onSuccess: refresh });
  const label = AGENT_LABELS[config.agent];
  const busy = save.isPending || reset.isPending;

  return (
    <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">{label.title}</h3>
        <Badge tone={config.customized ? 'blue' : 'neutral'}>
          {config.customized ? 'customized' : 'default'}
        </Badge>
        {label.notRunYet ? <Badge tone="amber">step not run yet</Badge> : null}
        <div className="flex-1" />
        {edits.model === null ? null : (
          <ModelField model={edits.model} onChange={edits.handleModel} />
        )}
      </header>
      <p className="text-xs text-zinc-500">{label.description}</p>
      <textarea
        className={`${inputClass} min-h-48 font-mono text-xs`}
        aria-label={`${label.title} prompt`}
        value={edits.prompt}
        onChange={(event) => {
          edits.setPrompt(event.target.value);
        }}
      />
      <ErrorText error={save.error ?? reset.error} />
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          disabled={!edits.dirty || edits.prompt.trim() === '' || busy}
          onClick={() => {
            save.mutate();
          }}
        >
          Save
        </Button>
        {edits.dirty ? <Button onClick={edits.handleDiscard}>Discard changes</Button> : null}
        {config.customized ? (
          <Button
            disabled={busy}
            onClick={() => {
              reset.mutate();
            }}
          >
            Reset to default
          </Button>
        ) : null}
      </div>
    </section>
  );
}

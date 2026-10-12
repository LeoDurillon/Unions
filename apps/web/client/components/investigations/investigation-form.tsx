import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AgentModel, InvestigationScope } from '@union/core';
import { INVESTIGATION_DEFAULTS } from '@union/core/investigation-defaults';
import { useState, type ReactElement, type SubmitEvent } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { api } from '../../lib/api';
import { ModelField } from '../agents/model-field';
import { ToolsField } from '../agents/tools-field';
import { Button, ErrorText, Field, inputClass, TextInput } from '../ui';
import { ScopeField } from './scope-field';

const DEFAULT_TOOLS = [...INVESTIGATION_DEFAULTS.tools];

/** A new investigation: what to look into, where, and with which model and tools. */
export function InvestigationForm({
  project,
  onCreated,
}: {
  project: PublicProject;
  onCreated: (id: number) => void;
}): ReactElement {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [scope, setScope] = useState<InvestigationScope>('repository');
  const [model, setModel] = useState<AgentModel>(INVESTIGATION_DEFAULTS.model);
  const [tools, setTools] = useState<string[]>(DEFAULT_TOOLS);
  const create = useMutation({
    mutationFn: () => api.createInvestigation(project.id, { title, prompt, scope, model, tools }),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ['investigations'] });
      onCreated(created.id);
    },
  });
  const handleSubmit = (event: SubmitEvent): void => {
    event.preventDefault();
    create.mutate();
  };
  const ready = title.trim() !== '' && prompt.trim() !== '' && tools.length > 0;

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <h3 className="text-base font-semibold">New investigation</h3>
      <Field label="Title">
        <TextInput value={title} placeholder="Why do builds take 10 minutes?" onChange={setTitle} />
      </Field>
      <Field label="Prompt" hint="Sent to the agent as is, with a note on where the code is.">
        <textarea
          className={`${inputClass} min-h-48 font-mono text-xs`}
          value={prompt}
          required
          onChange={(event) => {
            setPrompt(event.target.value);
          }}
        />
      </Field>
      <ScopeField
        value={scope}
        repository={`${project.owner}/${project.repo} · ${project.config.baseBranch}`}
        onChange={setScope}
      />
      <ModelField model={model} onChange={setModel} />
      <ToolsField
        agentTitle="Investigation"
        value={tools}
        defaults={DEFAULT_TOOLS}
        onChange={setTools}
      />
      <ErrorText error={create.error} />
      <Button type="submit" variant="primary" disabled={!ready || create.isPending}>
        Run investigation
      </Button>
    </form>
  );
}

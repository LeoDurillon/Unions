// A new investigation: what to look into, where, and with which model and tools.
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

type Draft = {
  title: string;
  prompt: string;
  scope: InvestigationScope;
  ticketId: number | null;
  model: AgentModel;
  tools: string[];
};

/** The form's fields, and creating the investigation from them. */
function useDraft(
  projectId: number,
  initialTicket: number | null,
  onCreated: (id: number) => void,
): {
  draft: Draft;
  set: (change: Partial<Draft>) => void;
  create: ReturnType<typeof useMutation<{ id: number }, Error, void>>;
  ready: boolean;
} {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft>({
    title: '',
    prompt: '',
    scope: initialTicket === null ? 'repository' : 'ticket',
    ticketId: initialTicket,
    model: INVESTIGATION_DEFAULTS.model,
    tools: DEFAULT_TOOLS,
  });
  const create = useMutation({
    mutationFn: () => {
      const { ticketId, ...fields } = draft;
      return api.createInvestigation(projectId, {
        ...fields,
        onTicketId: draft.scope === 'ticket' ? ticketId : null,
      });
    },
    onSuccess: async (created: { id: number }) => {
      await queryClient.invalidateQueries({ queryKey: ['investigations'] });
      onCreated(created.id);
    },
  });
  const ready =
    draft.title.trim() !== '' &&
    draft.prompt.trim() !== '' &&
    draft.tools.length > 0 &&
    (draft.scope !== 'ticket' || draft.ticketId !== null);
  return {
    draft,
    set: (change) => {
      setDraft((previous) => ({ ...previous, ...change }));
    },
    create,
    ready,
  };
}

/** What to look into: the title and the prompt. */
function QuestionFields({
  draft,
  set,
}: {
  draft: Draft;
  set: (change: Partial<Draft>) => void;
}): ReactElement {
  const { title, prompt } = draft;
  return (
    <>
      <Field label="Title">
        <TextInput
          value={title}
          placeholder="Why do builds take 10 minutes?"
          onChange={(value) => {
            set({ title: value });
          }}
        />
      </Field>
      <Field label="Prompt" hint="Sent to the agent as is, with a note on where the code is.">
        <textarea
          className={`${inputClass} min-h-48 font-mono text-xs`}
          value={prompt}
          required
          onChange={(event) => {
            set({ prompt: event.target.value });
          }}
        />
      </Field>
    </>
  );
}

/** A new investigation: what to look into, where, and with which model and tools. */
export function InvestigationForm({
  project,
  initialTicket = null,
  onCreated,
}: {
  project: PublicProject;
  /** Asked from a ticket: the investigation runs on it unless the user picks otherwise. */
  initialTicket?: number | null;
  onCreated: (id: number) => void;
}): ReactElement {
  const { draft, set, create, ready } = useDraft(project.id, initialTicket, onCreated);
  const { scope, ticketId, model, tools } = draft;
  const handleSubmit = (event: SubmitEvent): void => {
    event.preventDefault();
    create.mutate();
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <h3 className="text-base font-semibold">New investigation</h3>
      <QuestionFields draft={draft} set={set} />
      <ScopeField
        value={scope}
        repository={`${project.owner}/${project.repo} · ${project.config.baseBranch}`}
        onChange={(value) => {
          set({ scope: value });
        }}
        projectId={project.id}
        ticketId={ticketId}
        onTicket={(value) => {
          set({ ticketId: value });
        }}
      />
      <ModelField
        model={model}
        onChange={(value) => {
          set({ model: value });
        }}
      />
      <ToolsField
        agentTitle="Investigation"
        value={tools}
        defaults={DEFAULT_TOOLS}
        onChange={(value) => {
          set({ tools: value });
        }}
      />
      <ErrorText error={create.error} />
      <Button type="submit" variant="primary" disabled={!ready || create.isPending}>
        Run investigation
      </Button>
    </form>
  );
}

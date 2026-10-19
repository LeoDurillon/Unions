// A custom agent's own part of its page: its role, the prompt writer's progress, Regenerate, and Delete.
import type { AgentConfig, CustomAgentInfo } from '@union/core';
import { useState, type ReactElement } from 'react';

import { useCustomAgent, type CustomAgentActions } from '../../lib/use-custom-agent';
import { Badge, Button, ErrorText, Field, inputClass } from '../ui';

const ROLE_ROWS = 3;

function WriterStatus({ custom }: { custom: CustomAgentInfo }): ReactElement | null {
  switch (custom.promptStatus) {
    case 'queued':
    case 'running': {
      return <Badge tone="blue">Writing the prompt…</Badge>;
    }
    case 'failed': {
      return <Badge tone="red">The prompt writer failed</Badge>;
    }
    case 'ready': {
      return null;
    }
    default: {
      return null;
    }
  }
}

function RoleField({
  custom,
  actions,
}: {
  custom: CustomAgentInfo;
  actions: CustomAgentActions;
}): ReactElement {
  const [role, setRole] = useState(custom.role);
  const writing = custom.promptStatus === 'queued' || custom.promptStatus === 'running';
  const edited = role.trim() !== custom.role;
  return (
    <div className="space-y-2">
      <Field
        label="Role"
        hint="What the prompt is written from. Regenerate replaces the default prompt; a prompt you saved stays until you reset it."
      >
        <textarea
          className={inputClass}
          rows={ROLE_ROWS}
          value={role}
          onChange={(event) => {
            setRole(event.target.value);
          }}
        />
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={!edited || actions.edit.isPending}
          onClick={() => {
            actions.edit.mutate({ role });
          }}
        >
          Save role
        </Button>
        <Button
          disabled={edited || writing || actions.regenerate.isPending}
          title={edited ? 'Save the role first' : undefined}
          onClick={() => {
            actions.regenerate.mutate();
          }}
        >
          {custom.promptStatus === 'failed' ? 'Retry' : 'Regenerate the prompt'}
        </Button>
        <WriterStatus custom={custom} />
      </div>
      {custom.promptError ? (
        <p className="text-sm text-red-600 dark:text-red-400">{custom.promptError}</p>
      ) : null}
      <ErrorText error={actions.edit.error ?? actions.regenerate.error} />
    </div>
  );
}

/** Deleting is refused while a project's flow or an unfinished ticket runs the agent. */
function DeleteAgent({
  actions,
  name,
}: {
  actions: CustomAgentActions;
  name: string;
}): ReactElement {
  return (
    <div className="space-y-2 rounded-md border border-red-200 p-3 dark:border-red-900">
      <p className="text-sm">
        Deleting {name} removes it from the menus and the flow pickers. Finished tickets keep its
        tab.
      </p>
      <Button
        disabled={actions.remove.isPending}
        onClick={() => {
          if (globalThis.confirm(`Delete ${name}?`)) {
            actions.remove.mutate();
          }
        }}
      >
        Delete agent
      </Button>
      <ErrorText error={actions.remove.error} />
    </div>
  );
}

export function CustomAgentRole({ config }: { config: AgentConfig }): ReactElement | null {
  const actions = useCustomAgent(config.custom?.id ?? 0);
  return config.custom ? <RoleField custom={config.custom} actions={actions} /> : null;
}

export function CustomAgentDanger({ config }: { config: AgentConfig }): ReactElement | null {
  const actions = useCustomAgent(config.custom?.id ?? 0);
  return config.custom ? <DeleteAgent actions={actions} name={config.custom.name} /> : null;
}

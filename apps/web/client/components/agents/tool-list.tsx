// The tools the user added to the list with the form to add more, then the built-in ones, each in a card.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ToolOption } from '@union/core';
import { useState, type ReactElement, type SubmitEvent } from 'react';

import { api } from '../../lib/app/api';
import { useAgentTools } from '../../lib/union-settings/use-agent-tools';
import { SettingsIntro } from '../settings/settings-intro';
import { Loading, SkeletonRows } from '../ui/skeleton';
import { Button, ErrorText, inputClass } from '../ui/ui';

/** Rows shown while the list is read. */
const LOADING_ROWS = 3;

function AddToolForm(): ReactElement {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const add = useMutation({
    mutationFn: () => api.addTool({ name, description }),
    onSuccess: async () => {
      setName('');
      setDescription('');
      await queryClient.invalidateQueries({ queryKey: ['agent-tools'] });
    },
  });
  const submit = (event: SubmitEvent): void => {
    event.preventDefault();
    add.mutate();
  };
  return (
    <form
      onSubmit={submit}
      className="space-y-2 border-t border-zinc-200 pt-4 dark:border-zinc-800"
    >
      <div className="flex flex-wrap gap-2">
        <input
          className={`${inputClass} max-w-64 font-mono`}
          aria-label="Tool name"
          placeholder="Bash(pnpm test*)"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            add.reset();
          }}
        />
        <input
          className={`${inputClass} min-w-48 flex-1`}
          aria-label="Tool description"
          placeholder="What it is for (optional)"
          value={description}
          onChange={(event) => {
            setDescription(event.target.value);
          }}
        />
        <Button type="submit" disabled={name.trim() === '' || add.isPending}>
          Add tool
        </Button>
      </div>
      <ErrorText error={add.error} />
    </form>
  );
}

/** The tools every agent page lists without adding them: Claude Code's own and the git rules the defaults use. */
function BuiltIn({ tools }: { tools: ToolOption[] }): ReactElement | null {
  const builtIn = tools.filter((tool) => tool.source === 'built-in');
  if (builtIn.length === 0) {
    return null;
  }
  return (
    <section className="space-y-3">
      <div className="space-y-0.5">
        <h3 className="flex items-baseline gap-2 font-semibold">
          Built in <span className="text-sm font-normal text-zinc-500">{builtIn.length}</span>
        </h3>
        <p className="text-sm text-zinc-500">
          Claude Code&apos;s tools and the git rules the agents use by default: always listed.
        </p>
      </div>
      <ul className="flex flex-wrap gap-1.5">
        {builtIn.map((tool) => (
          <li
            key={tool.name}
            title={tool.description ?? undefined}
            className="rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400"
          >
            {tool.name}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The tools the user added, each with Remove; their shape while the list is read (`tools` null). */
function CustomTools({
  tools,
  removing,
  onRemove,
}: {
  tools: ToolOption[] | null;
  removing: boolean;
  onRemove: (name: string) => void;
}): ReactElement {
  if (tools === null) {
    return (
      <Loading label="Reading the tools" className="divide-y divide-zinc-200 dark:divide-zinc-800">
        <SkeletonRows count={LOADING_ROWS} columns="grid-cols-[12rem_1fr_4.5rem]" cells={2} />
      </Loading>
    );
  }
  if (tools.length === 0) {
    return <p className="text-sm text-zinc-500">No tools added yet.</p>;
  }
  return (
    <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
      {tools.map((tool) => (
        <li key={tool.name} className="flex items-center gap-3 px-3 py-2">
          <code className="shrink-0 text-xs font-medium">{tool.name}</code>
          <span className="flex-1 text-xs text-zinc-500">{tool.description}</span>
          <Button
            variant="quietDanger"
            size="sm"
            disabled={removing}
            onClick={() => {
              onRemove(tool.name);
            }}
          >
            Remove
          </Button>
        </li>
      ))}
    </ul>
  );
}

/** The tools the user added to the list, and the form to add more. */
export function ToolList(): ReactElement {
  const queryClient = useQueryClient();
  const tools = useAgentTools();
  const remove = useMutation({
    mutationFn: api.removeTool,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agent-tools'] }),
  });
  const custom = (tools.data ?? []).filter((tool) => tool.source === 'custom');
  return (
    <>
      <SettingsIntro>
        Claude Code&apos;s tools are always listed. Add a tool name (<code>mcp__server__tool</code>)
        or a permission rule (<code>Bash(pnpm lint*)</code>), then select it on the agents that need
        it. Pushing, remotes and branch changes stay blocked whatever is selected.
      </SettingsIntro>
      <section className="space-y-4">
        <h3 className="font-semibold">Your tools</h3>
        <ErrorText error={tools.error ?? remove.error} />
        <CustomTools
          tools={tools.isPending ? null : custom}
          removing={remove.isPending}
          onRemove={(name) => {
            remove.mutate(name);
          }}
        />
        <AddToolForm />
      </section>
      <BuiltIn tools={tools.data ?? []} />
    </>
  );
}

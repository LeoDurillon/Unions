import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactElement, type SubmitEvent } from 'react';

import { api } from '../../lib/api';
import { useAgentTools } from '../../lib/use-agent-tools';
import { Button, ErrorText, inputClass } from '../ui';

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
    <form onSubmit={submit} className="space-y-2">
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
    <section className="space-y-3">
      <header>
        <h3 className="text-sm font-semibold">Tools</h3>
        <p className="text-xs text-zinc-500">
          Claude Code&apos;s tools are always listed. Add a tool name (
          <code>mcp__server__tool</code>) or a permission rule (<code>Bash(pnpm lint*)</code>), then
          select it on the agents that need it. Pushing, remotes and branch changes stay blocked
          whatever is selected.
        </p>
      </header>
      <ErrorText error={tools.error ?? remove.error} />
      {custom.length === 0 ? (
        <p className="text-sm text-zinc-500">No tools added yet.</p>
      ) : (
        <ul className="divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
          {custom.map((tool) => (
            <li key={tool.name} className="flex items-center gap-3 py-1.5">
              <code className="text-xs">{tool.name}</code>
              <span className="flex-1 text-xs text-zinc-500">{tool.description}</span>
              <Button
                disabled={remove.isPending}
                onClick={() => {
                  remove.mutate(tool.name);
                }}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      <AddToolForm />
    </section>
  );
}

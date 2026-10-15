import type { ToolOption } from '@union/core';
import type { ReactElement } from 'react';

import { useAgentTools } from '../../lib/use-agent-tools';
import { CheckChip, ChipGroup } from '../choice';
import { ErrorText } from '../ui';

function ToolChip({
  tool,
  on,
  label,
  onToggle,
}: {
  tool: ToolOption;
  on: boolean;
  label: string;
  onToggle: (name: string, on: boolean) => void;
}): ReactElement {
  return (
    <CheckChip
      mono
      checked={on}
      label={label}
      title={tool.description ?? undefined}
      onChange={(checked) => {
        onToggle(tool.name, checked);
      }}
    >
      {tool.name}
      {tool.source === 'built-in' ? null : (
        <span className="ml-1 text-zinc-400">·{tool.source}</span>
      )}
    </CheckChip>
  );
}

/** Multi-select over the tool list: each tool is a toggle; the selection keeps the list's order. */
export function ToolsField({
  agentTitle,
  value,
  defaults,
  onChange,
}: {
  agentTitle: string;
  value: string[];
  defaults: string[];
  onChange: (tools: string[]) => void;
}): ReactElement {
  const tools = useAgentTools();
  const options = tools.data ?? [];
  const toggle = (name: string, on: boolean): void => {
    const next = on ? [...value, name] : value.filter((tool) => tool !== name);
    onChange(options.map((tool) => tool.name).filter((tool) => next.includes(tool)));
  };
  const isDefault =
    value.length === defaults.length && value.every((tool) => defaults.includes(tool));
  return (
    <fieldset className="space-y-2">
      <legend className="flex w-full items-center gap-2 text-sm">
        <span className="text-zinc-500">Tools</span>
        <span className="text-xs text-zinc-500">{value.length} selected</span>
        {isDefault ? null : (
          <button
            type="button"
            className="text-xs text-indigo-600 underline dark:text-indigo-400"
            onClick={() => {
              onChange(defaults);
            }}
          >
            Use defaults
          </button>
        )}
      </legend>
      <ErrorText error={tools.error} />
      <ChipGroup>
        {options.map((tool) => (
          <ToolChip
            key={tool.name}
            tool={tool}
            on={value.includes(tool.name)}
            label={`${agentTitle}: ${tool.name}`}
            onToggle={toggle}
          />
        ))}
      </ChipGroup>
      {value.length === 0 ? (
        <p className="text-xs text-red-600 dark:text-red-400">Select at least one tool.</p>
      ) : null}
    </fieldset>
  );
}

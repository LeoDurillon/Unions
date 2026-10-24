// Multi-select over the tool list: the selected tools as toggles, the others behind "Add a tool";
// the selection keeps the list's order.
import type { ToolOption } from '@union/core';
import { useState, type ReactElement } from 'react';

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

/** "Tools", how many are selected, and Use defaults when they are not the agent's own. */
function ToolsLegend({
  count,
  isDefault,
  onDefaults,
}: {
  count: number;
  isDefault: boolean;
  onDefaults: () => void;
}): ReactElement {
  return (
    <legend className="flex w-full items-center gap-2 text-sm">
      <span className="text-zinc-500">Tools</span>
      <span className="text-xs text-zinc-500">{count} selected</span>
      {isDefault ? null : (
        <button
          type="button"
          className="text-xs text-indigo-600 underline dark:text-indigo-400"
          onClick={onDefaults}
        >
          Use defaults
        </button>
      )}
    </legend>
  );
}

/** Shows the tools not selected, or folds them away again. */
function MoreToggle({
  open,
  count,
  onToggle,
}: {
  open: boolean;
  count: number;
  onToggle: () => void;
}): ReactElement | null {
  if (count === 0) {
    return null;
  }
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      className="rounded-full border border-dashed border-zinc-300 px-2.5 py-0.5 text-xs text-zinc-600 hover:border-zinc-400 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-100"
    >
      {open ? 'Show only the selected' : `+ Add a tool (${count} more)`}
    </button>
  );
}

/** Multi-select over the tool list: the selected as toggles, the rest behind "Add a tool"; the selection keeps the list's order. */
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
  const [all, setAll] = useState(false);
  const others = options.filter((tool) => !value.includes(tool.name)).length;
  const shown = all ? options : options.filter((tool) => value.includes(tool.name));
  return (
    <fieldset className="space-y-2">
      <ToolsLegend
        count={value.length}
        isDefault={isDefault}
        onDefaults={() => {
          onChange(defaults);
        }}
      />
      <ErrorText error={tools.error} />
      <ChipGroup>
        {shown.map((tool) => (
          <ToolChip
            key={tool.name}
            tool={tool}
            on={value.includes(tool.name)}
            label={`${agentTitle}: ${tool.name}`}
            onToggle={toggle}
          />
        ))}
        <MoreToggle
          open={all}
          count={others}
          onToggle={() => {
            setAll(!all);
          }}
        />
      </ChipGroup>
      {value.length === 0 ? (
        <p className="text-xs text-red-600 dark:text-red-400">Select at least one tool.</p>
      ) : null}
    </fieldset>
  );
}

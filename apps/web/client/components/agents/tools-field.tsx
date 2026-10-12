import type { ToolOption } from '@union/core';
import type { ReactElement } from 'react';

import { useAgentTools } from '../../lib/use-agent-tools';
import { ErrorText } from '../ui';

const CHIP_ON =
  'border-indigo-500 bg-indigo-50 text-indigo-900 dark:bg-indigo-950/50 dark:text-indigo-200';
const CHIP_OFF =
  'border-zinc-300 text-zinc-600 hover:border-zinc-500 dark:border-zinc-700 dark:text-zinc-400';

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
    <label
      title={tool.description ?? undefined}
      className={`relative cursor-pointer rounded-full border px-2.5 py-0.5 font-mono text-xs transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-indigo-500 ${on ? CHIP_ON : CHIP_OFF}`}
    >
      <input
        type="checkbox"
        className="sr-only"
        aria-label={label}
        checked={on}
        onChange={(event) => {
          onToggle(tool.name, event.target.checked);
        }}
      />
      {on ? '✓ ' : ''}
      {tool.name}
      {tool.source === 'custom' ? <span className="ml-1 text-zinc-400">·custom</span> : null}
    </label>
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
      <div className="flex flex-wrap gap-1.5">
        {options.map((tool) => (
          <ToolChip
            key={tool.name}
            tool={tool}
            on={value.includes(tool.name)}
            label={`${agentTitle}: ${tool.name}`}
            onToggle={toggle}
          />
        ))}
      </div>
      {value.length === 0 ? (
        <p className="text-xs text-red-600 dark:text-red-400">Select at least one tool.</p>
      ) : null}
    </fieldset>
  );
}

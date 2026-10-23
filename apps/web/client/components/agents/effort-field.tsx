// How hard the agent thinks (`claude --effort`); Default leaves it to Claude Code.
import type { AgentEffort } from '@union/core';
import { AGENT_EFFORTS, isAgentEffort } from '@union/core/states';
import type { ReactElement } from 'react';

import { EFFORT_LABELS } from './agent-labels';

/** How hard the agent thinks (`claude --effort`); Default leaves it to Claude Code. */
export function EffortField({
  effort,
  onChange,
  ariaLabel,
}: {
  effort: AgentEffort | null;
  onChange: (value: AgentEffort | null) => void;
  /** Names the field for screen readers instead of showing "Effort" beside it (a table's column says it). */
  ariaLabel?: string;
}): ReactElement {
  return (
    <label className="flex items-center gap-2 text-sm">
      {ariaLabel === undefined ? <span className="text-zinc-500">Effort</span> : null}
      <select
        aria-label={ariaLabel}
        className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        value={effort ?? ''}
        onChange={(event) => {
          const { value } = event.target;
          onChange(isAgentEffort(value) ? value : null);
        }}
      >
        <option value="">Default</option>
        {AGENT_EFFORTS.map((option) => (
          <option key={option} value={option}>
            {EFFORT_LABELS[option]}
          </option>
        ))}
      </select>
    </label>
  );
}

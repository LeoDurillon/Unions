import type { AgentModel } from '@union/core';
import { AGENT_MODELS, isAgentModel } from '@union/core/states';
import type { ReactElement } from 'react';

import { MODEL_LABELS } from './agent-labels';

/** The Claude model an agent runs with. */
export function ModelField({
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

// A flow's custom agents in the settings and the ticket's Custom flow: listed in order, moved, removed, added.
import type { CustomAgentNames } from '@union/core';
import { canMove, movedStep, withCustomStep, withoutStep } from '@union/core/flow-edit';
import { isCustomStep, type CustomStep, type Flow, type PipelineStep } from '@union/core/states';
import { stepTitle } from '@union/core/step-titles';
import type { ReactElement } from 'react';

import { useCustomAgentNames, useFlowAgents } from '../lib/use-custom-agents';
import { Button, inputClass } from './ui';

function CustomStepRow({
  flow,
  step,
  names,
  onChange,
}: {
  flow: Flow;
  step: CustomStep;
  names: CustomAgentNames;
  onChange: (steps: PipelineStep[]) => void;
}): ReactElement {
  const title = stepTitle(step, names);
  const where = flow.indexOf(step) > flow.indexOf('implement') ? 'after' : 'before';
  return (
    <li className="flex items-center gap-2 text-sm">
      <span className="font-medium">{title}</span>
      <span className="text-xs text-zinc-500">{where} the implementation</span>
      <div className="ml-auto flex gap-1">
        {([-1, 1] as const).map((by) => (
          <Button
            key={by}
            aria-label={`Move ${title} ${by < 0 ? 'up' : 'down'}`}
            disabled={!canMove(flow, step, by)}
            onClick={() => {
              onChange(movedStep(flow, step, by));
            }}
          >
            {by < 0 ? '↑' : '↓'}
          </Button>
        ))}
        <Button
          aria-label={`Remove ${title}`}
          onClick={() => {
            onChange(withoutStep(flow, step));
          }}
        >
          ✕
        </Button>
      </div>
    </li>
  );
}

/** Nothing when no custom agent exists and the flow names none. */
export function CustomFlowSteps({
  flow,
  onChange,
}: {
  flow: Flow;
  onChange: (steps: PipelineStep[]) => void;
}): ReactElement | null {
  const names = useCustomAgentNames();
  const addable = useFlowAgents().filter((agent) => !flow.includes(agent.step));
  const custom = flow.filter((step) => isCustomStep(step));
  if (custom.length === 0 && addable.length === 0) {
    return null;
  }
  return (
    <div className="space-y-1.5">
      <ul className="space-y-1">
        {custom.map((step) => (
          <CustomStepRow key={step} flow={flow} step={step} names={names} onChange={onChange} />
        ))}
      </ul>
      {addable.length > 0 ? (
        <select
          aria-label="Add a custom agent"
          className={`${inputClass} max-w-64`}
          value=""
          onChange={(event) => {
            const picked = addable.find((agent) => agent.step === event.target.value);
            if (picked) {
              onChange(withCustomStep(flow, picked.step));
            }
          }}
        >
          <option value="">Add a custom agent…</option>
          {addable.map((agent) => (
            <option key={agent.step} value={agent.step}>
              {agent.name}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  );
}

// Picks the ticket's flow: a preset or a custom one, shown as its planning steps and custom agents.
import type { CustomAgentNames } from '@union/core';
import { withPlanning } from '@union/core/flow-edit';
// Picks the steps a ticket runs: one of the project's presets, or planning steps chosen one by one.
import {
  flowName,
  projectPresets,
  resolveFlow,
  sameFlow,
  type FlowPreset,
} from '@union/core/flows';
import { PLANNING_STEPS, type Flow, type PipelineStep } from '@union/core/states';
import { useState, type ReactElement } from 'react';

import type { PublicProject } from '../../src/api-types';
import { stepTitle } from '../lib/labels';
import { useCustomAgentNames } from '../lib/use-custom-agents';
import { CheckChip, ChipGroup, Segmented } from './choice';
import { CustomFlowSteps } from './custom-flow-steps';

const CUSTOM = 'custom';

/** The preset a flow is, by id; null when no preset has these steps. */
function presetOf(flow: Flow, presets: readonly FlowPreset[]): FlowPreset | null {
  return presets.find((preset) => sameFlow(preset.steps, flow)) ?? null;
}

export function flowSteps(flow: Flow, names: CustomAgentNames = {}): string {
  return flow.map((step) => stepTitle(step, names)).join(' → ');
}

/**
 * A custom flow's planning steps, one chip each, then its custom agents; the implementation and the
 * review always run.
 */
export function PlanningChips({
  flow,
  onChange,
}: {
  flow: Flow;
  onChange: (steps: PipelineStep[]) => void;
}): ReactElement {
  return (
    <div className="space-y-2">
      <ChipGroup>
        {PLANNING_STEPS.map((planning) => (
          <CheckChip
            key={planning}
            checked={flow.includes(planning)}
            onChange={(on) => {
              onChange(withPlanning(flow, planning, on));
            }}
          >
            {stepTitle(planning)}
          </CheckChip>
        ))}
      </ChipGroup>
      <CustomFlowSteps flow={flow} onChange={onChange} />
    </div>
  );
}

/** `value` null: the project's default preset, which the ticket follows until it starts. */
export function FlowPicker({
  config,
  value,
  onChange,
}: {
  config: PublicProject['config'];
  value: PipelineStep[] | null;
  onChange: (flow: PipelineStep[] | null) => void;
}): ReactElement {
  const names = useCustomAgentNames();
  const presets = projectPresets(config);
  const flow = resolveFlow({ flow: value }, config);
  const defaultSteps = resolveFlow({ flow: null }, config);
  const [custom, setCustom] = useState(presetOf(flow, presets) === null);
  const preset = custom ? null : presetOf(flow, presets);
  // The default preset is stored as null, so the ticket follows a later change of the default.
  const choose = (steps: PipelineStep[]): void => {
    onChange(sameFlow(steps, defaultSteps) ? null : steps);
  };
  const options = [
    ...presets.map((option) => ({
      value: option.id,
      label: option.name,
      title: flowSteps(option.steps, names),
    })),
    { value: CUSTOM, label: 'Custom', title: 'Choose the planning steps and custom agents' },
  ];
  return (
    <div className="space-y-2">
      <Segmented
        legend="Flow"
        options={options}
        value={preset?.id ?? CUSTOM}
        onChange={(id) => {
          const picked = presets.find((option) => option.id === id);
          setCustom(picked === undefined);
          if (picked) {
            choose(picked.steps);
          }
        }}
      />
      {preset === null ? <PlanningChips flow={flow} onChange={choose} /> : null}
      <p className="text-xs text-zinc-500">
        {flowSteps(flow, names)}
        {sameFlow(flow, defaultSteps) ? ` (the project's default, ${flowName(flow, config)})` : ''}
      </p>
    </div>
  );
}

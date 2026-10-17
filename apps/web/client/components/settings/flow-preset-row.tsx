// One flow preset in the settings: its name, its planning steps, whether new tickets get it, and Remove.
import type { FlowPreset } from '@union/core/flows';
import type { ReactElement } from 'react';

import { flowSteps, PlanningChips } from '../flow-picker';
import { Button, inputClass } from '../ui';

export function FlowPresetRow({
  preset,
  isDefault,
  canRemove,
  onChange,
  onMakeDefault,
  onRemove,
}: {
  preset: FlowPreset;
  isDefault: boolean;
  canRemove: boolean;
  onChange: (preset: FlowPreset) => void;
  onMakeDefault: () => void;
  onRemove: () => void;
}): ReactElement {
  return (
    <li className="space-y-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex flex-wrap items-center gap-2">
        <input
          aria-label="Flow name"
          className={`${inputClass} max-w-48`}
          value={preset.name}
          onChange={(event) => {
            onChange({ ...preset, name: event.target.value });
          }}
        />
        <label className="flex items-center gap-1.5 text-sm">
          <input type="radio" name="default-flow" checked={isDefault} onChange={onMakeDefault} />
          Default for new tickets
        </label>
        <Button className="ml-auto" disabled={!canRemove} onClick={onRemove}>
          Remove
        </Button>
      </div>
      <PlanningChips
        flow={preset.steps}
        onChange={(steps) => {
          onChange({ ...preset, steps });
        }}
      />
      <p className="text-xs text-zinc-500">{flowSteps(preset.steps)}</p>
    </li>
  );
}

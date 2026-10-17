// The project's flow presets: the steps a ticket can run, and the one new tickets get.
import { BUILT_IN_PRESETS, projectPresets, type FlowPreset } from '@union/core/flows';
import type { ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { api } from '../../lib/api';
import { useSettingsForm } from '../../lib/use-settings-form';
import { Button } from '../ui';
import { FlowPresetRow } from './flow-preset-row';
import { SaveBar } from './save-bar';

type Flows = { flows: FlowPreset[]; defaultFlow: string };

const BUILT_IN: Flows = { flows: [...BUILT_IN_PRESETS], defaultFlow: 'full' };

function initial(config: PublicProject['config']): Flows {
  const flows = [...projectPresets(config)];
  const fallback = flows.some((preset) => preset.id === 'full') ? 'full' : (flows[0]?.id ?? '');
  return { flows, defaultFlow: config.defaultFlow ?? fallback };
}

/** The first `flow-<n>` id no preset has. */
function newId(flows: FlowPreset[]): string {
  let n = flows.length + 1;
  while (flows.some((preset) => preset.id === `flow-${n}`)) {
    n += 1;
  }
  return `flow-${n}`;
}

function problem({ flows }: Flows): string | null {
  const names = flows.map((preset) => preset.name.trim().toLowerCase());
  if (names.includes('')) {
    return 'Every flow needs a name.';
  }
  return new Set(names).size < names.length ? 'Two flows have the same name.' : null;
}

/** What is saved: the built-in presets as none of the project's own. */
function saved(value: Flows): { flows: FlowPreset[] | null; defaultFlow: string } {
  const builtIn = JSON.stringify(value.flows) === JSON.stringify(BUILT_IN_PRESETS);
  return { flows: builtIn ? null : value.flows, defaultFlow: value.defaultFlow };
}

/** `preset` in place of the one at `at` (null removes it); the default moves to the first if it went. */
function replaced({ flows, defaultFlow }: Flows, at: number, preset: FlowPreset | null): Flows {
  const next = flows.flatMap((other, index) => {
    if (index !== at) {
      return [other];
    }
    return preset ? [preset] : [];
  });
  const kept = next.some((other) => other.id === defaultFlow);
  return { flows: next, defaultFlow: kept ? defaultFlow : (next[0]?.id ?? '') };
}

export function FlowsSection({ project }: { project: PublicProject }): ReactElement {
  const form = useSettingsForm(
    () => initial(project.config),
    (value) => api.updateProject(project.id, saved(value)),
  );
  const { flows, defaultFlow } = form.value;
  const replace = (at: number, preset: FlowPreset | null): void => {
    form.set(replaced(form.value, at, preset));
  };
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">Flows</h3>
      <p className="text-xs text-zinc-500">
        The steps a ticket runs, picked when it is created and changeable until it starts. Every
        flow ends with the implementation and the final review; a small fix can skip planning.
      </p>
      <ul className="space-y-2">
        {flows.map((preset, at) => (
          <FlowPresetRow
            key={preset.id}
            preset={preset}
            isDefault={preset.id === defaultFlow}
            canRemove={flows.length > 1}
            onChange={(next) => {
              replace(at, next);
            }}
            onMakeDefault={() => {
              form.set({ flows, defaultFlow: preset.id });
            }}
            onRemove={() => {
              replace(at, null);
            }}
          />
        ))}
      </ul>
      <div className="flex gap-2">
        <Button
          onClick={() => {
            const steps: FlowPreset['steps'] = ['implement', 'final_review'];
            form.set({ flows: [...flows, { id: newId(flows), name: '', steps }], defaultFlow });
          }}
        >
          Add a flow
        </Button>
        <Button
          onClick={() => {
            form.set(BUILT_IN);
          }}
        >
          Use the built-in flows
        </Button>
      </div>
      <SaveBar state={form} invalid={problem(form.value)} />
    </section>
  );
}

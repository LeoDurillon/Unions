import { useQuery } from '@tanstack/react-query';
import type { AgentConfig } from '@union/core';
import type { ReactElement } from 'react';

import { api } from '../../lib/api';
import { modelRows, useModelsForm, type ModelChoice } from '../../lib/use-models-form';
import { AGENT_LABELS, EFFORT_LABELS, MODEL_LABELS } from '../agents/agent-labels';
import { EffortField } from '../agents/effort-field';
import { ModelField } from '../agents/model-field';
import { SaveBar } from '../settings/save-bar';
import { ErrorText } from '../ui';

const CELL = 'py-1.5 pr-3';

function ImplementationsChoice({ choice }: { choice: ModelChoice | undefined }): ReactElement {
  const effort = choice?.effort ? EFFORT_LABELS[choice.effort] : 'Default';
  return (
    <td colSpan={2} className={`${CELL} text-xs text-zinc-500`}>
      Uses Implementation’s{choice ? `: ${MODEL_LABELS[choice.model]}, ${effort} effort` : ''}
    </td>
  );
}

function ModelRow({
  config,
  choice,
  implementation,
  onChange,
}: {
  config: AgentConfig;
  choice: ModelChoice | undefined;
  implementation: ModelChoice | undefined;
  onChange: (choice: ModelChoice) => void;
}): ReactElement {
  const { title } = AGENT_LABELS[config.agent];
  return (
    <tr className="border-t border-zinc-200 dark:border-zinc-800">
      <td className={`${CELL} font-medium`}>{title}</td>
      {choice === undefined ? (
        <ImplementationsChoice choice={implementation} />
      ) : (
        <>
          <td className={CELL}>
            <ModelField
              ariaLabel={`${title} model`}
              model={choice.model}
              onChange={(model) => {
                onChange({ ...choice, model });
              }}
            />
          </td>
          <td className={CELL}>
            <EffortField
              ariaLabel={`${title} effort`}
              effort={choice.effort}
              onChange={(effort) => {
                onChange({ ...choice, effort });
              }}
            />
          </td>
        </>
      )}
    </tr>
  );
}

function ModelsForm({ configs }: { configs: AgentConfig[] }): ReactElement {
  const form = useModelsForm(configs);
  const rows = modelRows(configs);
  return (
    <section className="space-y-3">
      <header>
        <h3 className="text-sm font-semibold">Models</h3>
        <p className="text-xs text-zinc-500">
          Every agent’s model and effort in one place. Each agent’s page has the same fields;
          changes apply to the next run of that step.
        </p>
      </header>
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-zinc-500">
          <tr>
            <th className={`${CELL} font-medium`}>Agent</th>
            <th className={`${CELL} font-medium`}>Model</th>
            <th className={`${CELL} font-medium`}>Effort</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((config) => (
            <ModelRow
              key={config.agent}
              config={config}
              choice={form.value[config.agent]}
              implementation={form.value.implement}
              onChange={(choice) => {
                form.set({ ...form.value, [config.agent]: choice });
              }}
            />
          ))}
        </tbody>
      </table>
      <SaveBar state={form} />
    </section>
  );
}

/** Every agent's model and effort in a table, with one Save. */
export function ModelsPage(): ReactElement {
  const agents = useQuery({ queryKey: ['agents'], queryFn: api.agents });
  if (agents.data === undefined) {
    return <ErrorText error={agents.error} />;
  }
  return <ModelsForm configs={agents.data} />;
}

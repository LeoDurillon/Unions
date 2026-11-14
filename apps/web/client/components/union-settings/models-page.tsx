// All agents in one table: each one's model and effort with one Save, whether it was customized, and a link to its page.

import { useQuery } from '@tanstack/react-query';
import type { AgentConfig } from '@union/core';
import type { ReactElement } from 'react';

import { api } from '../../lib/app/api';
import { modelRows, useModelsForm } from '../../lib/union-settings/use-models-form';
import { SaveBar } from '../settings/save-bar';
import { SettingsIntro } from '../settings/settings-intro';
import { CELL, ModelRow } from './agent-row';
import { SettingsPending } from './union-settings-loader';

/** The rows the table shows while the agents are read. */
const MODEL_ROWS = 8;

function ModelsForm({ configs }: { configs: AgentConfig[] }): ReactElement {
  const form = useModelsForm(configs);
  const rows = modelRows(configs);
  return (
    <section className="space-y-3">
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

/** All agents in one table, with one Save for their models and efforts. */
export function ModelsPage(): ReactElement {
  const agents = useQuery({ queryKey: ['agents'], queryFn: api.agents });
  return (
    <>
      <SettingsIntro>
        Every agent’s model and effort in one place, changes applying to the next run of that step.
        Click an agent for its prompt and tools; a dot marks one you customized.
      </SettingsIntro>
      {agents.data === undefined ? (
        <SettingsPending error={agents.error} label="Reading the agents" fields={MODEL_ROWS} />
      ) : (
        <ModelsForm configs={agents.data} />
      )}
    </>
  );
}

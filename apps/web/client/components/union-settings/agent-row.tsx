// One row of the All agents table: the agent's name (opening its page, a dot when you changed its settings), its model and effort.
import type { AgentConfig } from '@union/core';
import type { ReactElement } from 'react';

import { openUnionSettings } from '../../lib/union-settings-sections';
import type { ModelChoice } from '../../lib/use-models-form';
import { agentLabel, EFFORT_LABELS, MODEL_LABELS } from '../agents/agent-labels';
import { EffortField } from '../agents/effort-field';
import { ModelField } from '../agents/model-field';

export const CELL = 'py-1.5 pr-3';

function ImplementationsChoice({ choice }: { choice: ModelChoice | undefined }): ReactElement {
  const effort = choice?.effort ? EFFORT_LABELS[choice.effort] : 'Default';
  return (
    <td colSpan={2} className={`${CELL} text-xs text-zinc-500`}>
      Uses Implementation’s{choice ? `: ${MODEL_LABELS[choice.model]}, ${effort} effort` : ''}
    </td>
  );
}

/** The agent's name, opening its page; a dot when you changed its settings. */
function AgentLink({ config, title }: { config: AgentConfig; title: string }): ReactElement {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1.5 text-left hover:underline"
      onClick={() => {
        openUnionSettings(config.agent);
      }}
    >
      {title}
      {config.customized ? (
        <span
          title="Customized: you changed its settings"
          className="size-1.5 rounded-full bg-indigo-500"
        >
          <span className="sr-only"> (customized)</span>
        </span>
      ) : null}
    </button>
  );
}

export function ModelRow({
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
  const { title } = agentLabel(config);
  return (
    <tr className="border-t border-zinc-200 dark:border-zinc-800">
      <td className={`${CELL} font-medium`}>
        <AgentLink config={config} title={title} />
      </td>
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

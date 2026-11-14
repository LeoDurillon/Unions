// One agent's prompt, model, effort and tools, with one Save; the next run of that step uses them.

import { useQuery } from '@tanstack/react-query';
import type { AgentId } from '@union/core';
import { useState, type ReactElement } from 'react';

import { api } from '../../lib/app/api';
import { SettingsIntro } from '../settings/settings-intro';
import { SettingsPending } from '../union-settings/union-settings-loader';
import { AgentForm } from './agent-form';
import { agentLabel } from './agent-labels';
import { CustomAgentDanger } from './custom-agent-card';

/** The rows of the form's shape while the agents are read. */
const FORM_ROWS = 4;

type Shown = { agent: AgentId; prompt: string };

/**
 * The default prompt the form started from. A new one (from the prompt writer) is shown once the
 * form takes it (`handleTake`), so a refetch never drops unsaved edits.
 */
function useShownDefault(
  agent: AgentId,
  defaultPrompt: string | undefined,
): { shown: string | undefined; handleTake: () => void } {
  const [shown, setShown] = useState<Shown | null>(null);
  if (defaultPrompt !== undefined && shown?.agent !== agent) {
    setShown({ agent, prompt: defaultPrompt });
  }
  return {
    shown: shown?.agent === agent ? shown.prompt : defaultPrompt,
    handleTake: () => {
      if (defaultPrompt !== undefined) {
        setShown({ agent, prompt: defaultPrompt });
      }
    },
  };
}

/** One agent's prompt, model, effort and tools, with one Save; the next run of that step uses them. */
export function AgentPage({ agent }: { agent: AgentId }): ReactElement {
  const agents = useQuery({ queryKey: ['agents'], queryFn: api.agents });
  // A reset replaces what was saved: the form starts again from the defaults.
  const [resets, setResets] = useState(0);
  const config = agents.data?.find((entry) => entry.agent === agent);
  const shownDefault = useShownDefault(agent, config?.defaultPrompt);
  if (config === undefined) {
    return agents.data ? (
      <p className="text-sm text-zinc-500">This agent does not exist, or was deleted.</p>
    ) : (
      <SettingsPending error={agents.error} label="Reading the agent" fields={FORM_ROWS} />
    );
  }
  return (
    <>
      <SettingsIntro>{agentLabel(config).description}</SettingsIntro>
      <AgentForm
        // A new prompt from the writer starts the form again from it, once the form takes it.
        key={`${resets}-${shownDefault.shown}`}
        config={config}
        newDefault={shownDefault.shown !== config.defaultPrompt}
        onTakeDefault={shownDefault.handleTake}
        onReset={() => {
          setResets((count) => count + 1);
        }}
      />
      <CustomAgentDanger config={config} />
    </>
  );
}

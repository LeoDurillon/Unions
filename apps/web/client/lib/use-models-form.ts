// The Models page's form: every agent's model and effort, each changed one saved with its prompt and tools as they are.
import { useQueryClient } from '@tanstack/react-query';
import type { AgentConfig, AgentEffort, AgentModel } from '@union/core';

import { api } from './api';
import { menuIndex } from './union-settings-groups';
import { sameTools } from './use-agent-form';
import { useSettingsForm, type SettingsForm } from './use-settings-form';

export type ModelChoice = { model: AgentModel; effort: AgentEffort | null };
/** By agent id; only the agents that have a model of their own. */
export type ModelChoices = Record<string, ModelChoice>;

function choicesOf(configs: readonly AgentConfig[]): ModelChoices {
  const choices: ModelChoices = {};
  for (const config of configs) {
    if (config.model !== null) {
      choices[config.agent] = { model: config.model, effort: config.effort };
    }
  }
  return choices;
}

/** The table's rows, in menu order; Shared instructions run with every agent and have no model. */
export function modelRows(configs: readonly AgentConfig[]): AgentConfig[] {
  return configs
    .filter((config) => config.agent !== 'shared')
    .toSorted((a, b) => menuIndex(a.agent) - menuIndex(b.agent));
}

function changed(config: AgentConfig, choice: ModelChoice | undefined): choice is ModelChoice {
  return choice !== undefined && (choice.model !== config.model || choice.effort !== config.effort);
}

export function useModelsForm(configs: readonly AgentConfig[]): SettingsForm<ModelChoices> {
  const queryClient = useQueryClient();
  return useSettingsForm(
    () => choicesOf(configs),
    async (choices) => {
      const saves = configs.flatMap((config) => {
        const choice = choices[config.agent];
        if (!changed(config, choice)) {
          return [];
        }
        return [
          api.saveAgent(config.agent, {
            prompt: config.prompt,
            ...choice,
            // As on the agent's page: unchanged default tools stay unsaved.
            tools: sameTools(config.tools, config.defaultTools) ? null : config.tools,
          }),
        ];
      });
      try {
        await Promise.all(saves);
      } finally {
        await queryClient.invalidateQueries({ queryKey: ['agents'] });
      }
    },
  );
}

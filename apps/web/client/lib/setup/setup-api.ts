// The browser's client for the setup agent: its latest run with the proposal and checks, starting one, testing values.

import type {
  AgentModel,
  Investigation,
  SetupCheck,
  SetupCheckInput,
  SetupView,
} from '@union/core';

import { request } from '../app/api';

/** What Test again sends: the card's values as they are in its fields. */
export type SetupTestRequest = SetupCheckInput;

function setupPath(projectId: number): string {
  return `/api/projects/${projectId}/setup`;
}

export const setupApi = {
  /** Null when the project never had a setup run. */
  latest: (projectId: number): Promise<SetupView | null> => request('GET', setupPath(projectId)),
  start: (projectId: number, model: AgentModel): Promise<Investigation> =>
    request('POST', setupPath(projectId), { model }),
  /** Test again: the worker checks these commands, or these preview settings as Apply would save them. */
  test: (projectId: number, body: SetupTestRequest): Promise<SetupCheck> =>
    request('POST', `${setupPath(projectId)}/checks`, body),
};

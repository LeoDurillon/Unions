// The browser's client for the setup agent: its latest run with the proposal, and starting one.

import type { AgentModel, Investigation, SetupView } from '@union/core';

import { request } from '../app/api';

function setupPath(projectId: number): string {
  return `/api/projects/${projectId}/setup`;
}

export const setupApi = {
  /** Null when the project never had a setup run. */
  latest: (projectId: number): Promise<SetupView | null> => request('GET', setupPath(projectId)),
  start: (projectId: number, model: AgentModel): Promise<Investigation> =>
    request('POST', setupPath(projectId), { model }),
};

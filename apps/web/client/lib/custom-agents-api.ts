// The browser's client for the custom agents endpoints: create, edit, regenerate the prompt, delete.
import type { AgentConfig } from '@union/core';

import { request } from './api';

const BASE = '/api/agents/custom';

export const customAgentsApi = {
  create: (input: { name: string; role: string }): Promise<AgentConfig> =>
    request('POST', BASE, input),
  edit: (id: number, change: { name?: string; role?: string }): Promise<AgentConfig> =>
    request('PATCH', `${BASE}/${id}`, change),
  regenerate: (id: number): Promise<AgentConfig> => request('POST', `${BASE}/${id}/regenerate`),
  remove: (id: number): Promise<null> => request('DELETE', `${BASE}/${id}`),
};

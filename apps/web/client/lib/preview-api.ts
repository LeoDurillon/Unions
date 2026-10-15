// The browser's client for a ticket's preview endpoints.
import type { PreviewConfig } from '@union/core';

import type { PreviewSettingsView, PreviewView, PublicProject } from '../../src/api-types';
import { request } from './api';

function base(ticketId: number): string {
  return `/api/tickets/${ticketId}/preview`;
}

export const previewApi = {
  get: (ticketId: number): Promise<PreviewView> => request('GET', base(ticketId)),
  start: (ticketId: number): Promise<PreviewView> => request('POST', `${base(ticketId)}/start`),
  stop: (ticketId: number): Promise<PreviewView> => request('POST', `${base(ticketId)}/stop`),
  logs: (ticketId: number): Promise<PreviewView> => request('POST', `${base(ticketId)}/logs`),
  /** The worker runs the project's e2e command against the ticket's preview. */
  e2e: (ticketId: number): Promise<PreviewView> => request('POST', `${base(ticketId)}/e2e`),
  /** The worker generates the compose file without starting anything. */
  generate: (ticketId: number): Promise<PreviewView> =>
    request('POST', `${base(ticketId)}/generate`),
  /** The ticket's own compose file; null uses the generated one again. */
  saveOwnFile: (ticketId: number, yaml: string | null): Promise<PreviewView> =>
    request('PUT', `${base(ticketId)}/compose`, { yaml }),
  settings: (projectId: number): Promise<PreviewSettingsView> =>
    request('GET', `/api/projects/${projectId}/preview`),
  /** Written, never read back: the settings only list the names. */
  setSecret: (projectId: number, name: string, value: string): Promise<PreviewSettingsView> =>
    request('PUT', `/api/projects/${projectId}/preview/secrets/${encodeURIComponent(name)}`, {
      value,
    }),
  deleteSecret: (projectId: number, name: string): Promise<PreviewSettingsView> =>
    request('DELETE', `/api/projects/${projectId}/preview/secrets/${encodeURIComponent(name)}`),
  /** Null removes the project's preview settings. */
  saveSettings: (projectId: number, preview: PreviewConfig | null): Promise<PublicProject> =>
    request('PUT', `/api/projects/${projectId}/preview`, { preview }),
};

// Applying one part of a setup proposal through the endpoint its settings page uses, then reading the settings again.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PreviewConfig, ProjectScript } from '@union/core';

import type { PublicProject } from '../../../src/api-types';
import { api, request } from '../app/api';
import { previewApi } from '../preview/preview-api';

/** What a card's Apply sends: the same requests as Settings and Environments. */
export function setupWrites(projectId: number): {
  project: (change: {
    installCommand?: string;
    gateCommand?: string;
    instructions?: string;
    scripts?: ProjectScript[];
  }) => Promise<PublicProject>;
  preview: (preview: PreviewConfig) => Promise<PublicProject>;
  dockerfile: (dockerfile: string) => Promise<unknown>;
} {
  return {
    project: (change) => api.updateProject(projectId, change),
    preview: (preview) => previewApi.saveSettings(projectId, preview),
    dockerfile: (dockerfile) =>
      request('PUT', `/api/projects/${projectId}/agent-image`, { kind: 'dockerfile', dockerfile }),
  };
}

/** One card's Apply: the write, then the project and its settings read again. */
export function useSetupApply(write: () => Promise<unknown>): {
  apply: () => void;
  pending: boolean;
  error: Error | null;
} {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: write,
    onSuccess: async () => {
      await Promise.all(
        ['projects', 'agent-image', 'preview-settings', 'project-files'].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      );
    },
  });
  return {
    apply: () => {
      mutation.mutate();
    },
    pending: mutation.isPending,
    error: mutation.error,
  };
}

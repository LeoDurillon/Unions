// What the compose file of the project's latest preview offers (its services and profiles), for the
// pages that pick among them.
import { useQuery } from '@tanstack/react-query';

import type { PreviewSettingsView } from '../../../src/api-types';
import { previewApi } from '../../lib/preview/preview-api';

/** The services and profiles found; null until a preview's file was read once. */
export function useComposeServices(projectId: number): PreviewSettingsView['composeServices'] {
  const settings = useQuery({
    queryKey: ['preview-settings', projectId],
    queryFn: () => previewApi.settings(projectId),
  });
  return settings.data?.composeServices ?? null;
}

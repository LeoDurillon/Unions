// The Disconnect button of a tracker's settings section: drops the integration and its secret at once.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { IntegrationKindName } from '@union/core/integration-kinds';
import type { ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { integrationsApi, projectIntegration } from '../../lib/integrations/integrations-api';
import { Button, ErrorText } from '../ui/ui';

/** Applies at once: the integration secret is dropped and imports stop. Nothing when not connected. */
export function Disconnect({
  project,
  kind,
}: {
  project: PublicProject;
  kind: IntegrationKindName;
}): ReactElement | null {
  const queryClient = useQueryClient();
  const disconnect = useMutation({
    mutationFn: () => integrationsApi.remove(project.id, kind),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  });
  if (!projectIntegration(project, kind)) {
    return null;
  }
  return (
    <>
      <ErrorText error={disconnect.error} />
      <Button
        disabled={disconnect.isPending}
        onClick={() => {
          disconnect.mutate();
        }}
      >
        Disconnect
      </Button>
    </>
  );
}

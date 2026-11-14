// The Disconnect button of a tracker's settings section: asks, then drops the integration and its secret.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { integrationKind, type IntegrationKindName } from '@union/core/integration-kinds';
import type { ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { integrationsApi, projectIntegration } from '../../lib/integrations/integrations-api';
import { ConfirmButton } from '../ui/confirm-button';
import { ErrorText } from '../ui/ui';

/** Asks first, then the integration secret is dropped and imports stop. Nothing when not connected. */
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
      <ConfirmButton
        label="Disconnect"
        question={`Disconnect ${integrationKind(kind).label}? Its token is deleted and imports stop.`}
        confirmLabel="Disconnect"
        disabled={disconnect.isPending}
        onConfirm={() => {
          disconnect.mutate();
        }}
      />
    </>
  );
}

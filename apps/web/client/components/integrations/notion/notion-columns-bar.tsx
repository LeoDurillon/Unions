// Above the event rules: the Notion columns of the project's data source as Union last read them, and reading them again.

import { useMutation } from '@tanstack/react-query';
import type { NotionSchema } from '@union/core';
import type { ReactElement } from 'react';

import { integrationsApi } from '../../../lib/integrations/integrations-api';
import { formatWhen } from '../../../lib/ui/relative-time';
import { Button, ErrorText } from '../../ui/ui';

export function NotionColumnsBar({
  projectId,
  notion,
  onRefreshed,
}: {
  projectId: number;
  notion: NotionSchema | null;
  onRefreshed: () => Promise<void>;
}): ReactElement {
  const refresh = useMutation({
    mutationFn: () => integrationsApi.refreshFields(projectId, 'notion'),
    onSuccess: onRefreshed,
  });
  return (
    <div className="flex items-center gap-3 text-sm">
      <p className="min-w-0 flex-1 text-zinc-500">
        {notion
          ? `Notion columns of “${notion.title}”, read ${formatWhen(notion.fetchedAt)} (${notion.properties.length} properties).`
          : 'The Notion columns are not read yet.'}
      </p>
      <ErrorText error={refresh.error} />
      <Button
        disabled={refresh.isPending}
        onClick={() => {
          refresh.mutate();
        }}
      >
        {refresh.isPending ? 'Reading…' : 'Refresh from Notion'}
      </Button>
    </div>
  );
}

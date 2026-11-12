// Above the event rules: the Jira project's statuses and fields as Union last read them, and reading them again.

import { useMutation } from '@tanstack/react-query';
import type { JiraRuleSource } from '@union/core';
import type { ReactElement } from 'react';

import { integrationsApi } from '../../../lib/integrations/integrations-api';
import { formatWhen } from '../../../lib/ui/relative-time';
import { Button, ErrorText } from '../../ui/ui';

export function JiraFieldsBar({
  projectId,
  source,
  onRefreshed,
}: {
  projectId: number;
  source: JiraRuleSource;
  onRefreshed: () => Promise<void>;
}): ReactElement {
  const refresh = useMutation({
    mutationFn: () => integrationsApi.refreshFields(projectId, 'jira'),
    onSuccess: onRefreshed,
  });
  return (
    <div className="flex items-center gap-3 text-sm">
      <p className="min-w-0 flex-1 text-zinc-500">
        {source.readAt === null
          ? 'The Jira project is not read yet: read it to pick its statuses and fields in rules.'
          : `Jira project “${source.title}”, read ${formatWhen(source.readAt)} (${source.statuses.length} statuses, ${source.fields.length} fields rules can set).`}
      </p>
      <ErrorText error={refresh.error} />
      <Button
        disabled={refresh.isPending}
        onClick={() => {
          refresh.mutate();
        }}
      >
        {refresh.isPending ? 'Reading…' : 'Refresh from Jira'}
      </Button>
    </div>
  );
}

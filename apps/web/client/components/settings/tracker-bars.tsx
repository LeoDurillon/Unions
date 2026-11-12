// Above the event rules: each connected tracker's columns or fields as Union last read them, and reading them
// again.

import { useMutation } from '@tanstack/react-query';
import type { NotionSchema } from '@union/core';
import type { ReactElement } from 'react';

import type { EventRulesResponse } from '../../../src/event-api-types';
import { integrationsApi } from '../../lib/integrations/integrations-api';
import { formatWhen } from '../../lib/ui/relative-time';
import { JiraFieldsBar } from '../integrations/jira/jira-fields-bar';
import { Button, ErrorText } from '../ui/ui';

function NotionColumns({
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

/** Notion's columns and Jira's fields, in a card, for the trackers the project is connected to; none: nothing. */
export function TrackerBars({
  projectId,
  data,
  onRefreshed,
}: {
  projectId: number;
  data: EventRulesResponse | undefined;
  onRefreshed: () => Promise<void>;
}): ReactElement | null {
  if (!data?.hasNotion && !data?.jira) {
    return null;
  }
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">Trackers&apos; columns</h3>
      <p className="text-xs text-zinc-500">
        What the rules can set, as Union last read it. Read it again after changing the columns.
      </p>
      {data.hasNotion ? (
        <NotionColumns projectId={projectId} notion={data.notion} onRefreshed={onRefreshed} />
      ) : null}
      {data.jira ? (
        <JiraFieldsBar projectId={projectId} source={data.jira} onRefreshed={onRefreshed} />
      ) : null}
    </section>
  );
}

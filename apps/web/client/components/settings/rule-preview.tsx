import { useMutation, useQuery } from '@tanstack/react-query';
import { useState, type ReactElement } from 'react';

import type { RulePreview } from '../../../src/event-api-types';
import { api } from '../../lib/api';
import { eventRulesApi, type RuleDraft } from '../../lib/event-rules-api';
import { Button, ErrorText, inputClass } from '../ui';

function PreviewResult({ result }: { result: RulePreview | undefined }): ReactElement | null {
  if (result === undefined) {
    return null;
  }
  if (!result.ok) {
    return <p className="text-sm text-red-600 dark:text-red-400">{result.error}</p>;
  }
  return (
    <p className="text-sm">
      Would set <span className="font-medium">{result.property}</span> to{' '}
      <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">
        {result.text === '' ? '(empty)' : result.text}
      </code>{' '}
      on the ticket&apos;s Notion page.
    </p>
  );
}

/** What the rule as edited would send for a ticket imported from Notion; nothing is sent. */
export function RulePreviewBox({
  projectId,
  rule,
}: {
  projectId: number;
  rule: RuleDraft;
}): ReactElement {
  const tickets = useQuery({
    queryKey: ['tickets', projectId],
    queryFn: () => api.tickets(projectId),
  });
  const linked = (tickets.data ?? []).filter((ticket) => ticket.notionPageId !== null);
  const [ticketId, setTicketId] = useState<number | null>(null);
  const preview = useMutation({
    mutationFn: (id: number) => eventRulesApi.preview(projectId, rule, id),
  });
  const chosen = ticketId ?? linked[0]?.id ?? null;
  if (linked.length === 0) {
    return (
      <p className="text-xs text-zinc-500">No ticket imported from Notion to try it on yet.</p>
    );
  }
  return (
    <div className="space-y-2 rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
      <div className="flex items-center gap-2">
        <select
          aria-label="Ticket to try the rule on"
          className={inputClass}
          value={chosen ?? ''}
          onChange={(event) => {
            setTicketId(Number(event.target.value));
          }}
        >
          {linked.map((ticket) => (
            <option key={ticket.id} value={ticket.id}>
              {ticket.title}
            </option>
          ))}
        </select>
        <Button
          disabled={chosen === null || preview.isPending}
          onClick={() => {
            if (chosen !== null) {
              preview.mutate(chosen);
            }
          }}
        >
          Preview
        </Button>
      </div>
      <ErrorText error={preview.error} />
      <PreviewResult result={preview.data} />
    </div>
  );
}

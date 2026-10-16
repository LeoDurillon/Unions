import { useMutation, useQuery } from '@tanstack/react-query';
import type { EventAction } from '@union/core/event-actions';
import { useState, type ReactElement } from 'react';

import type { TicketSummary } from '../../../src/api-types';
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
  if (result.kind === 'union_notification') {
    return (
      <div className="space-y-1 text-sm">
        <p>Would notify you in Union:</p>
        <div className="rounded bg-zinc-100 p-2 dark:bg-zinc-800">
          <p className="font-semibold">{result.title}</p>
          <p className="text-zinc-600 dark:text-zinc-400">
            {result.text === '' ? '(empty: nothing would be sent)' : result.text}
          </p>
        </div>
      </div>
    );
  }
  if (result.kind === 'github_comment') {
    return (
      <div className="space-y-1 text-sm">
        <p>
          Would comment on {result.on === 'issue' ? 'issue' : 'pull request'} #{result.number}:
        </p>
        <pre className="rounded bg-zinc-100 p-2 whitespace-pre-wrap dark:bg-zinc-800">
          {result.text === '' ? '(empty: nothing would be sent)' : result.text}
        </pre>
      </div>
    );
  }
  return (
    <div className="space-y-1 text-sm">
      <p>Would set on the ticket&apos;s Notion page:</p>
      <ul className="list-inside list-disc">
        {result.properties.map((property) => (
          <li key={property.name}>
            <span className="font-medium">{property.name}</span> to{' '}
            <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">
              {property.text === '' ? '(empty)' : property.text}
            </code>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The tickets a rule's action can apply to, and how to say there are none. */
function applicable(
  tickets: TicketSummary[],
  action: EventAction,
): { tickets: TicketSummary[]; none: string } {
  if (action.kind === 'notion_property') {
    const linked = tickets.filter((ticket) => ticket.notionPageId !== null);
    return { tickets: linked, none: 'No ticket imported from Notion to try it on yet.' };
  }
  if (action.kind === 'union_notification') {
    return { tickets, none: 'No ticket to try it on yet.' };
  }
  if (action.on === 'issue') {
    const withIssue = tickets.filter((ticket) => ticket.issueNumber !== null);
    return { tickets: withIssue, none: 'No ticket with a GitHub issue to try it on yet.' };
  }
  const withPr = tickets.filter((ticket) => ticket.prNumber !== null);
  return { tickets: withPr, none: 'No ticket with a pull request to try it on yet.' };
}

/** What the rule as edited would do for one of the project's tickets; nothing is sent. */
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
  const { tickets: linked, none } = applicable(tickets.data ?? [], rule.action);
  const [ticketId, setTicketId] = useState<number | null>(null);
  const preview = useMutation({
    mutationFn: (id: number) => eventRulesApi.preview(projectId, rule, id),
  });
  const chosen = ticketId ?? linked[0]?.id ?? null;
  if (linked.length === 0) {
    return <p className="text-xs text-zinc-500">{none}</p>;
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

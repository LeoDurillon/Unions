// A project's usage split per step, per model and per ticket: calls, tokens and API-equivalent cost,
// most expensive first.
import type { ProjectUsage, UsageSlice } from '@union/core';
import type { ReactElement, ReactNode } from 'react';

import { stepTitle } from '../../lib/labels';
import { count } from '../../lib/token-counts';
import { costText } from '../../lib/usage-format';
import { useCustomAgentNames } from '../../lib/use-custom-agents';

type Row = UsageSlice & { key: string; label: ReactNode };

function CostTable({ title, rows }: { title: string; rows: Row[] }): ReactElement | null {
  if (rows.length === 0) {
    return null;
  }
  return (
    <section className="space-y-1">
      <h3 className="text-sm font-semibold">{title}</h3>
      <table className="w-full text-xs">
        <thead className="text-left text-zinc-500">
          <tr>
            <th className="py-1 font-normal">
              <span className="sr-only">{title}</span>
            </th>
            <th className="py-1 text-right font-normal">Calls</th>
            <th className="py-1 text-right font-normal">In</th>
            <th className="py-1 text-right font-normal">Out</th>
            <th className="py-1 text-right font-normal">Cost</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {rows.map((row) => (
            <tr key={row.key} className="border-t border-zinc-200 dark:border-zinc-800">
              <td className="max-w-0 truncate py-1 pr-2">{row.label}</td>
              <td className="w-12 text-right">{row.calls}</td>
              <td className="w-14 text-right">{count(row.input)}</td>
              <td className="w-14 text-right">{count(row.output)}</td>
              <td className="w-20 text-right">{costText(row.costUsd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function TicketLabel({
  ticket,
  onOpen,
}: {
  ticket: ProjectUsage['tickets'][number];
  onOpen: (id: number) => void;
}): ReactElement {
  return (
    <button
      type="button"
      title={ticket.title}
      onClick={() => {
        onOpen(ticket.ticketId);
      }}
      className="max-w-full truncate text-left text-indigo-600 hover:underline dark:text-indigo-400"
    >
      {ticket.issueNumber === null ? '' : `#${ticket.issueNumber} `}
      {ticket.title}
    </button>
  );
}

function ticketRows(usage: ProjectUsage, onOpen: (id: number) => void): Row[] {
  const rows: Row[] = usage.tickets.map((ticket) => ({
    ...ticket,
    key: `ticket-${ticket.ticketId}`,
    label: <TicketLabel ticket={ticket} onOpen={onOpen} />,
  }));
  if (usage.investigations.calls > 0) {
    rows.push({ ...usage.investigations, key: 'investigations', label: 'All investigations' });
  }
  return rows;
}

export function UsageBreakdown({
  usage,
  onOpenTicket,
}: {
  usage: ProjectUsage;
  onOpenTicket: (id: number) => void;
}): ReactElement {
  const names = useCustomAgentNames();
  const steps: Row[] = usage.steps.map((step) => ({
    ...step,
    key: step.step ?? 'outside',
    label:
      step.step === null ? 'Outside a step (descriptions, rebases…)' : stepTitle(step.step, names),
  }));
  const models: Row[] = usage.models.map((model) => ({
    ...model,
    key: model.model,
    label: model.model,
  }));
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <CostTable title="By step" rows={steps} />
      <CostTable title="By model" rows={models} />
      <CostTable title="Most expensive tickets" rows={ticketRows(usage, onOpenTicket)} />
    </div>
  );
}

// A project's usage split per step, per model and per ticket: calls, tokens and API-equivalent cost, most
// expensive first. A bar shows each row's cost against the costliest.

import type { ProjectUsage, UsageSlice } from '@union/core';
import type { ReactElement, ReactNode } from 'react';

import { stepTitle } from '../../lib/board/labels';
import { count } from '../../lib/log/token-counts';
import { useCustomAgentNames } from '../../lib/union-settings/use-custom-agents';
import { costText } from '../../lib/usage/usage-format';
import { shareOf } from '../../lib/usage/usage-shares';

type Row = UsageSlice & { key: string; label: ReactNode };

function CostTable({ title, rows }: { title: string; rows: Row[] }): ReactElement | null {
  if (rows.length === 0) {
    return null;
  }
  return (
    <section className="h-fit space-y-2 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h3 className="text-[13px] font-semibold">{title}</h3>
      <table className="w-full text-xs">
        <thead className="text-left text-zinc-500">
          <tr>
            <th className="py-1 font-normal">
              <span className="sr-only">{title}</span>
            </th>
            <th className="w-24 py-1 font-normal">
              <span className="sr-only">Share of the cost</span>
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
              <td className="max-w-0 truncate py-1.5 pr-2">{row.label}</td>
              <td aria-hidden className="pr-3">
                <span className="block h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                  <span
                    className="block h-full rounded-full bg-indigo-500"
                    style={{ width: `${shareOf(row, rows)}%` }}
                  />
                </span>
              </td>
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

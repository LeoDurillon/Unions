// The top of the ticket panel's page: its title, its state, flow and branch, its progress and what it needs.
import { flowName, resolveFlow } from '@union/core/flows';
import type { Step } from '@union/core/states';
import type { ReactElement } from 'react';

import type { TicketDetail } from '../../src/api-types';
import { describePhase, type Tone } from '../lib/labels';
import { useCustomAgentNames } from '../lib/use-custom-agents';
import { TicketAttention } from './ticket-attention';
import { TicketProgress } from './ticket-progress';

const PILL: Record<Tone, string> = {
  neutral:
    'border-zinc-200 bg-zinc-100 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300',
  blue: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-300',
  amber:
    'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300',
  red: 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300',
  green:
    'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300',
};

const DOT: Record<Tone, string> = {
  neutral: 'bg-zinc-400',
  blue: 'bg-blue-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
  green: 'bg-emerald-500',
};

const CHIP =
  'inline-flex h-6.5 items-center gap-1.5 rounded-full border border-zinc-200 px-2.5 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-400';

function StatusPill({ detail }: { detail: TicketDetail }): ReactElement {
  const names = useCustomAgentNames();
  const phase = describePhase(detail.ticket.phase, names);
  // Running and waiting are live: their dot pulses.
  const live = phase.tone === 'blue' || phase.tone === 'amber';
  return (
    <span
      className={`inline-flex h-6.5 items-center gap-2 rounded-full border px-2.5 text-xs font-semibold ${PILL[phase.tone]}`}
    >
      <span className="relative flex size-2">
        {live ? (
          <span
            className={`absolute inset-0 animate-ping rounded-full opacity-60 ${DOT[phase.tone]}`}
          />
        ) : null}
        <span className={`relative size-2 rounded-full ${DOT[phase.tone]}`} />
      </span>
      {phase.label}
    </span>
  );
}

function BranchChip({ detail }: { detail: TicketDetail }): ReactElement | null {
  const { branch } = detail.ticket;
  const base = detail.base.branch;
  if (!branch && !base) {
    return null;
  }
  return (
    <span
      className={`${CHIP} max-w-full font-mono`}
      title={[branch, base].filter(Boolean).join(' → ')}
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className="size-3.5 shrink-0"
      >
        <circle cx="6" cy="6" r="2.5" />
        <circle cx="6" cy="18" r="2.5" />
        <circle cx="18" cy="8" r="2.5" />
        <path d="M6 8.5v7M18 10.5c0 4-6 3-11 5.5" />
      </svg>
      <span className="truncate">{branch ? `${branch} → ${base ?? '?'}` : base}</span>
    </span>
  );
}

/** The top of the ticket panel's page: title, state, progress, and what the ticket needs. */
export function TicketHero({
  detail,
  viewing,
  onOpenStep,
  onReview,
}: {
  detail: TicketDetail;
  /** The step whose tab is open, if any. */
  viewing: Step | null;
  onOpenStep: (step: Step) => void;
  onReview: () => void;
}): ReactElement {
  const { ticket, project } = detail;
  const flow = flowName(resolveFlow(ticket, project.config), project.config);
  return (
    <div className="space-y-4 px-6 pt-1 pb-5">
      <h2 className="max-w-4xl text-2xl leading-tight font-semibold tracking-tight text-balance">
        {ticket.title}
      </h2>
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill detail={detail} />
        <span className={CHIP}>{flow} flow</span>
        <BranchChip detail={detail} />
      </div>
      {ticket.phase.kind === 'backlog' ? null : (
        <TicketProgress detail={detail} onOpenStep={onOpenStep} />
      )}
      <TicketAttention
        detail={detail}
        viewing={viewing}
        onOpenStep={onOpenStep}
        onReview={onReview}
      />
    </div>
  );
}

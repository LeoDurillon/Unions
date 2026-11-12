// The top of an open investigation: its title and state, where it ran (scope, model, questions, tools), and its
// actions: Run again or Cancel, Export, Delete, Open ticket and Write a ticket from it.
import type { Investigation } from '@union/core';
import type { ReactElement } from 'react';

import { MODEL_LABELS } from '../agents/agent-labels';
import { StatusPill } from '../status-pill';
import { Actions } from './investigation-actions';
import { SCOPE_LABELS, STATUS_LABELS } from './investigation-labels';
import { TicketButtons } from './investigation-ticket';

/** "2 questions" once it had follow-ups. */
function questionsOf(investigation: Investigation): string | null {
  const count = investigation.history.length + 1;
  return count === 1 ? null : `${count} questions`;
}

export function InvestigationHeader({
  investigation,
  onDeleted,
  onAskTicket,
  onOpenTicket,
}: {
  investigation: Investigation;
  onDeleted: () => void;
  /** Write a ticket from it; null while its form is open. */
  onAskTicket: (() => void) | null;
  onOpenTicket: (id: number) => void;
}): ReactElement {
  const status = STATUS_LABELS[investigation.status];
  const meta = [
    SCOPE_LABELS[investigation.scope].title,
    MODEL_LABELS[investigation.model],
    questionsOf(investigation),
  ].filter((part) => part !== null);
  return (
    <header className="space-y-3 px-8 pt-6 pb-4">
      <div className="flex flex-wrap items-start gap-3">
        <h1 className="min-w-0 flex-[1_1_20rem] text-xl leading-snug font-semibold tracking-tight">
          {investigation.title}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <Actions investigation={investigation} onDeleted={onDeleted} />
          <TicketButtons
            investigation={investigation}
            onAsk={onAskTicket}
            onOpenTicket={onOpenTicket}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500">
        <StatusPill tone={status.tone} label={status.label} size="sm" />
        <span>{meta.join(' · ')}</span>
        <span aria-hidden>·</span>
        <span className="font-mono text-[11px]">{investigation.tools.join(', ')}</span>
      </div>
    </header>
  );
}

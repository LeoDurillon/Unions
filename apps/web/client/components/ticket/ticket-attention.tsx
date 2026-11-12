// The card under the ticket's progress saying what it needs from the user now, with the button that does it.

import type { Step } from '@union/core/states';
import { stepTitle } from '@union/core/step-titles';
import type { ReactElement } from 'react';

import type { TicketDetail } from '../../../src/api-types';
import { isBlocked } from '../../lib/board/labels';
import { attentionOf, type Attention } from '../../lib/ticket/ticket-attention';
import { useTicketCommands } from '../../lib/ticket/use-ticket-commands';
import { useCustomAgentNames } from '../../lib/union-settings/use-custom-agents';
import { Button, ErrorText } from '../ui/ui';

const CARD: Record<Attention['tone'], string> = {
  amber: 'border-amber-200 bg-amber-50 dark:border-amber-900/70 dark:bg-amber-950/40',
  red: 'border-red-200 bg-red-50 dark:border-red-900/70 dark:bg-red-950/40',
  neutral: 'border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50',
};

const ICON: Record<Attention['tone'], string> = {
  amber: 'border-amber-200 text-amber-700 dark:border-amber-900 dark:text-amber-300',
  red: 'border-red-200 text-red-700 dark:border-red-900 dark:text-red-300',
  neutral: 'border-zinc-200 text-indigo-600 dark:border-zinc-700 dark:text-indigo-400',
};

function AttentionIcon({ tone }: { tone: Attention['tone'] }): ReactElement {
  return (
    <span
      className={`flex size-9 shrink-0 items-center justify-center rounded-lg border bg-white dark:bg-zinc-950 ${ICON[tone]}`}
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-[18px]"
      >
        {tone === 'neutral' ? (
          <path d="M8 5.5v13l10-6.5-10-6.5Z" />
        ) : (
          <path d="M12 9v4m0 4h.01M10.3 3.9 2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
        )}
      </svg>
    </span>
  );
}

/** A key's hint inside a button. */
function Key({ children }: { children: string }): ReactElement {
  return (
    <kbd className="rounded border border-current px-1 font-mono text-[10px] leading-4 opacity-70">
      {children}
    </kbd>
  );
}

function StartButton({ detail }: { detail: TicketDetail }): ReactElement {
  const { command } = useTicketCommands(detail.ticket.id);
  const blocked = isBlocked(detail.ticket);
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="primary"
        disabled={command.isPending || blocked}
        title={blocked ? 'Waits for the parent ticket to be done' : undefined}
        onClick={() => {
          command.mutate({ type: 'start' });
        }}
      >
        Start
      </Button>
      <ErrorText error={command.error} />
    </div>
  );
}

function Actions({
  detail,
  attention,
  onOpenStep,
  onReview,
}: {
  detail: TicketDetail;
  attention: Attention;
  onOpenStep: (step: Step) => void;
  onReview: () => void;
}): ReactElement | null {
  const names = useCustomAgentNames();
  const { step } = attention;
  if (attention.kind === 'start') {
    return <StartButton detail={detail} />;
  }
  if (step === null) {
    return null;
  }
  const open = (
    <Button
      variant={attention.kind === 'review' ? 'secondary' : 'primary'}
      onClick={() => {
        onOpenStep(step);
      }}
    >
      Open {stepTitle(step, names)}
    </Button>
  );
  if (attention.kind !== 'review' || !detail.ticket.branch) {
    return open;
  }
  return (
    <div className="flex gap-2">
      {open}
      <Button variant="primary" className="flex items-center gap-2" onClick={onReview}>
        Review changes <Key>R</Key>
      </Button>
    </div>
  );
}

/** What the ticket needs from the user now; nothing while it runs, once it ended, or on the step's own tab. */
export function TicketAttention({
  detail,
  viewing,
  onOpenStep,
  onReview,
}: {
  detail: TicketDetail;
  /** The step whose tab is open, if any: its own review bar asks already. */
  viewing: Step | null;
  onOpenStep: (step: Step) => void;
  onReview: () => void;
}): ReactElement | null {
  const names = useCustomAgentNames();
  const attention = attentionOf(detail, names);
  if (!attention || (attention.step !== null && attention.step === viewing)) {
    return null;
  }
  return (
    <section
      aria-label="What the ticket needs from you"
      className={`flex flex-wrap items-center gap-4 rounded-xl border px-4 py-3.5 ${CARD[attention.tone]}`}
    >
      <AttentionIcon tone={attention.tone} />
      <div className="min-w-0 flex-[1_1_16rem]">
        <p className="font-semibold">{attention.title}</p>
        {attention.detail ? (
          <p className="line-clamp-2 text-[13px] text-zinc-600 dark:text-zinc-400">
            {attention.detail}
          </p>
        ) : null}
      </div>
      <Actions detail={detail} attention={attention} onOpenStep={onOpenStep} onReview={onReview} />
    </section>
  );
}

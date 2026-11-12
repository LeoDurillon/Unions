// The ticket's way through its flow, drawn as stops: each step's state and what it did; a click opens its tab.
import type { Step } from '@union/core/states';
import type { ReactElement } from 'react';

import type { TicketDetail } from '../../src/api-types';
import { progressOf, type ProgressStop, type StopState } from '../lib/ticket-progress';
import { useCustomAgentNames } from '../lib/use-custom-agents';
import { CheckIcon } from './icon-button';

const RING: Record<StopState, string> = {
  done: 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-zinc-950',
  running: 'border-2 border-blue-500 bg-blue-50 dark:bg-blue-950',
  waiting: 'border-2 border-amber-500 bg-amber-50 dark:bg-amber-950',
  stalled: 'border-2 border-red-500 bg-red-50 dark:bg-red-950',
  todo: 'border-2 border-zinc-300 dark:border-zinc-700',
};

/** The dot inside the ring of a stop that is live; a halo pulses around those that wait for something. */
const CORE: Record<StopState, string | null> = {
  done: null,
  running: 'bg-blue-500',
  waiting: 'bg-amber-500',
  stalled: 'bg-red-500',
  todo: null,
};

const NOTE: Record<StopState, string> = {
  done: 'text-zinc-500 dark:text-zinc-400',
  running: 'text-blue-700 dark:text-blue-300',
  waiting: 'text-amber-700 dark:text-amber-300',
  stalled: 'text-red-700 dark:text-red-300',
  todo: 'text-zinc-400 dark:text-zinc-500',
};

function StopDot({ state }: { state: StopState }): ReactElement {
  const core = CORE[state];
  const pulses = state === 'running' || state === 'waiting';
  return (
    <span
      className={`relative flex size-6 shrink-0 items-center justify-center rounded-full ${RING[state]}`}
    >
      {pulses && core ? (
        <span className={`absolute inset-0 animate-ping rounded-full opacity-30 ${core}`} />
      ) : null}
      {state === 'done' ? <CheckIcon /> : null}
      {core ? <span className={`size-2 rounded-full ${core}`} /> : null}
    </span>
  );
}

function StopText({
  stop,
  onOpen,
}: {
  stop: ProgressStop;
  onOpen: (step: Step) => void;
}): ReactElement {
  const reached = stop.state !== 'todo';
  const text = (
    <>
      <span
        className={`block text-[13px] font-semibold ${reached ? '' : 'font-medium text-zinc-500 dark:text-zinc-400'}`}
      >
        {stop.label}
      </span>
      <span className={`block text-xs ${NOTE[stop.state]}`}>{stop.note || ' '}</span>
    </>
  );
  const { step } = stop;
  if (step === null || !reached) {
    return <div className="pr-3">{text}</div>;
  }
  return (
    <button
      type="button"
      className="-mx-1.5 rounded-md px-1.5 pr-3 text-left hover:bg-zinc-200/60 dark:hover:bg-zinc-800/60"
      title={`Open ${stop.label}`}
      onClick={() => {
        onOpen(step);
      }}
    >
      {text}
    </button>
  );
}

/** The ticket's way through its flow, drawn as stops: each step's state and what it did. */
export function TicketProgress({
  detail,
  onOpenStep,
}: {
  detail: TicketDetail;
  onOpenStep: (step: Step) => void;
}): ReactElement {
  const names = useCustomAgentNames();
  const stops = progressOf(detail, names);
  return (
    <ol
      aria-label="Progress"
      className="flex overflow-x-auto rounded-xl border border-zinc-200 bg-zinc-50 px-5 py-4 dark:border-zinc-800 dark:bg-zinc-900/50"
    >
      {stops.map((stop, index) => {
        const last = index === stops.length - 1;
        return (
          <li
            key={stop.id}
            className={`flex flex-col gap-2 ${last ? 'w-24 shrink-0' : 'min-w-24 flex-1'}`}
          >
            <div className="flex items-center">
              <StopDot state={stop.state} />
              {last ? null : (
                <span
                  className={`mx-2 h-0.5 flex-1 rounded-full ${stop.state === 'done' ? 'bg-emerald-500' : 'bg-zinc-200 dark:bg-zinc-800'}`}
                />
              )}
            </div>
            <StopText stop={stop} onOpen={onOpenStep} />
          </li>
        );
      })}
    </ol>
  );
}

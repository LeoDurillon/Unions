// The getting-started checklist above a project's board: five steps from settings to a reviewed change,
// each ticked from the project's state, until they are all done or the user hides it.
import { useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';

import type { PublicProject } from '../../src/api-types';
import { api } from '../lib/api';
import {
  gettingStarted,
  GETTING_STARTED_STEPS,
  type GettingStartedStep,
} from '../lib/getting-started';
import { guideHref } from '../lib/guide-links';
import { openGuide } from '../lib/guide-url';
import { openSettings } from '../lib/settings-sections';
import { useGettingStartedShown } from '../lib/use-getting-started-shown';
import { Button } from './ui';

type Action = { label: string; handleClick: () => void };

/** A step's title, what it does, and the guide's page and heading on it. */
const TEXT: Record<GettingStartedStep, { title: string; what: string; guide: [string, string] }> = {
  checks: {
    title: 'Set the check command',
    what: 'Your tests, lint or typecheck in one command. The agent works until it passes.',
    guide: ['first-project', 'tell-the-agents-how-to-build-and-check-your-code'],
  },
  ticket: {
    title: 'Write a ticket',
    what: 'A title and the change you want, as you would write it for a colleague.',
    guide: ['tickets', 'create-a-ticket'],
  },
  start: {
    title: 'Start it',
    what: 'Click Start on its card, or drag it into In progress. Agents run in Docker with your Claude account.',
    guide: ['tickets', 'start-a-ticket'],
  },
  plan: {
    title: 'Answer the planning',
    what: 'Each planning step waits for you under Needs you (press n): approve it, or ask for a revision.',
    guide: ['ticket-lifecycle', 'planning'],
  },
  review: {
    title: 'Review the change',
    what: 'Open Review changes on the ticket, comment or approve, then merge its pull request.',
    guide: ['reviewing', 'review-a-tickets-branch'],
  },
};

function StepItem({
  index,
  step,
  done,
  action,
}: {
  index: number;
  step: GettingStartedStep;
  done: boolean;
  action?: Action;
}): ReactElement {
  const { title, what, guide } = TEXT[step];
  return (
    <li className="flex gap-2.5">
      <span
        aria-hidden
        className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${done ? 'bg-green-600 text-white' : 'border border-zinc-300 text-zinc-500 dark:border-zinc-700'}`}
      >
        {done ? '✓' : index + 1}
      </span>
      <div className="min-w-0 space-y-1">
        <p className={`text-sm font-medium ${done ? 'text-zinc-500 line-through' : ''}`}>
          {title}
          <span className="sr-only">{done ? ' (done)' : ''}</span>
        </p>
        <p className="text-xs text-zinc-500">
          {what}{' '}
          <a
            href={guideHref(...guide)}
            onClick={(event) => {
              event.preventDefault();
              openGuide(...guide);
            }}
            className="text-indigo-600 hover:underline dark:text-indigo-400"
          >
            Learn more
          </a>
        </p>
        {action && !done ? (
          <Button size="sm" onClick={action.handleClick}>
            {action.label}
          </Button>
        ) : null}
      </div>
    </li>
  );
}

/** The checklist above the board, or nothing once the user hid it, or every step is done and it was not asked for. */
export function GettingStarted({
  project,
  onNewTicket,
}: {
  project: PublicProject;
  onNewTicket: () => void;
}): ReactElement | null {
  const tickets = useQuery({
    queryKey: ['tickets', project.id],
    queryFn: () => api.tickets(project.id),
  });
  const [shown, hide] = useGettingStartedShown(project.id);
  if (shown === 'hidden' || !tickets.data) {
    return null;
  }
  const done = gettingStarted(tickets.data, project.config);
  const count = GETTING_STARTED_STEPS.filter((step) => done[step]).length;
  if (count === GETTING_STARTED_STEPS.length && shown !== 'asked') {
    return null;
  }
  const actions: Partial<Record<GettingStartedStep, Action>> = {
    checks: {
      label: 'Open Checks',
      handleClick: () => {
        openSettings('checks');
      },
    },
    ticket: { label: 'New ticket', handleClick: onNewTicket },
  };
  return (
    <section
      aria-label="Getting started"
      className="mx-4 mt-3 rounded-lg border border-indigo-200 bg-indigo-50/50 p-4 dark:border-indigo-900 dark:bg-indigo-950/20"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">
          Getting started{' '}
          <span className="font-normal text-zinc-500">
            {count} of {GETTING_STARTED_STEPS.length} done
          </span>
        </h2>
        <Button size="sm" variant="ghost" onClick={hide}>
          Hide
        </Button>
      </div>
      <ol className="grid gap-4 md:grid-cols-5">
        {GETTING_STARTED_STEPS.map((step, index) => (
          <StepItem key={step} index={index} step={step} done={done[step]} action={actions[step]} />
        ))}
      </ol>
    </section>
  );
}

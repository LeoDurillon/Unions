// The project's shared services now: whether they run, which previews and agents use them, and
// Restart and Stop. Also why their last start failed.

import type { ReactElement } from 'react';

import type { SharedServicesView } from '../../../src/shared-services-types';
import type { Tone } from '../../lib/board/labels';
import { useSharedServices, useSharedServicesAction } from '../../lib/preview/use-shared-services';
import { formatWhen } from '../../lib/ui/relative-time';
import { Badge, Button, ErrorText } from '../ui/ui';
import { SharedLinks } from './shared-links';

type Stack = NonNullable<SharedServicesView['stack']>;

const STATUS: Record<Stack['status'], { label: string; tone: Tone }> = {
  running: { label: 'Running', tone: 'green' },
  stopped: { label: 'Stopped', tone: 'neutral' },
  failed: { label: 'Failed', tone: 'red' },
};

const LINK = 'text-indigo-600 hover:underline dark:text-indigo-400';

/** Who uses them: the previews (a ticket's opens its panel) and the agents. */
function Users({
  view,
  onOpenTicket,
}: {
  view: SharedServicesView;
  onOpenTicket: (ticketId: number) => void;
}): ReactElement {
  const ticket = (ticketId: number, title: string, suffix = ''): ReactElement => (
    <button
      key={`${suffix}${ticketId}`}
      type="button"
      className={LINK}
      onClick={() => {
        onOpenTicket(ticketId);
      }}
    >
      {title}
      {suffix}
    </button>
  );
  const users = [
    ...view.previews.map((user) =>
      user.kind === 'ticket' ? (
        ticket(user.ticketId, user.title)
      ) : (
        <span key={`r${user.reviewId}`}>
          #{user.number} {user.title}
        </span>
      ),
    ),
    ...view.agents.map(({ ticketId, title }) => ticket(ticketId, title, ' (its agent)')),
  ];
  if (users.length === 0) {
    return <p className="text-xs text-zinc-500">No preview uses them now.</p>;
  }
  return (
    <p className="flex flex-wrap gap-x-2 text-xs text-zinc-500">
      Used by: {users.map((user, index) => [index > 0 ? ' · ' : '', user])}
    </p>
  );
}

/** The title line: their state, a request on its way, Restart and Stop. */
function Heading({
  projectId,
  view,
}: {
  projectId: number;
  view: SharedServicesView;
}): ReactElement {
  const act = useSharedServicesAction(projectId);
  const { stack, refusals, pending } = view;
  const ask = (action: 'restart' | 'stop', refusal: string | null, label: string): ReactElement => (
    <Button
      disabled={refusal !== null || act.isPending}
      title={refusal ?? undefined}
      onClick={() => {
        act.mutate(action);
      }}
    >
      {label}
    </Button>
  );
  return (
    <>
      <div className="flex items-center gap-2">
        <h3 id="shared-now" className="text-sm font-semibold">
          Now
        </h3>
        {stack ? (
          <Badge tone={STATUS[stack.status].tone}>{STATUS[stack.status].label}</Badge>
        ) : null}
        {pending ? (
          <span className="text-xs text-zinc-500">
            {pending === 'restart' ? 'Restarting…' : 'Stopping…'}
          </span>
        ) : null}
        <span className="flex-1" />
        {ask('restart', refusals.restart, 'Restart')}
        {ask('stop', stack?.status === 'running' ? refusals.stop : 'They are not running.', 'Stop')}
      </div>
      <ErrorText error={act.error} />
    </>
  );
}

/** Each service, who uses them, when they started, and why the last start failed. */
function Details({
  stack,
  view,
  onOpenTicket,
}: {
  stack: Stack;
  view: SharedServicesView;
  onOpenTicket: (ticketId: number) => void;
}): ReactElement {
  return (
    <>
      <ul className="flex flex-wrap gap-1.5 text-xs">
        {stack.services.map(({ service, running }) => (
          <li key={service}>
            <Badge tone={running ? 'green' : 'neutral'}>
              {service}
              {running ? '' : ' (stopped)'}
            </Badge>
          </li>
        ))}
      </ul>
      <SharedLinks urls={stack.urls} />
      <Users view={view} onOpenTicket={onOpenTicket} />
      <p className="text-xs text-zinc-500">
        {stack.startedAt ? `Started ${formatWhen(stack.startedAt)} · ` : ''}
        Checked {formatWhen(stack.updatedAt)}
      </p>
      {stack.error ? (
        <pre className="whitespace-pre-wrap rounded bg-red-50 p-2 text-xs text-red-800 dark:bg-red-950/40 dark:text-red-300">
          {stack.error}
        </pre>
      ) : null}
    </>
  );
}

/** Their state, who uses them, and Restart and Stop. */
export function SharedServicesStatus({
  projectId,
  onOpenTicket,
}: {
  projectId: number;
  onOpenTicket: (ticketId: number) => void;
}): ReactElement {
  const shared = useSharedServices(projectId);
  const view = shared.data;
  if (!view) {
    return <ErrorText error={shared.error} />;
  }
  return (
    <section
      aria-labelledby="shared-now"
      className="space-y-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800"
    >
      <Heading projectId={projectId} view={view} />
      {view.stack ? (
        <Details stack={view.stack} view={view} onOpenTicket={onOpenTicket} />
      ) : (
        <p className="text-xs text-zinc-500">
          They have not run yet: they start with the first preview that uses them, and stop once
          none does.
        </p>
      )}
    </section>
  );
}

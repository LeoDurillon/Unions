// The implementer session in the ticket's Overview: how much context the next step resumes, and Compact.

import type { ReactElement } from 'react';

import type { SessionCompactionView } from '../../../src/routes/tickets/ticket-session';
import { thousands } from '../../lib/ticket/session-context';
import { useSessionCompaction } from '../../lib/ticket/use-session-compaction';
import { Button, ErrorText } from '../ui/ui';

const HINT =
  'Every step that writes code resumes this conversation and reads all of it again on each turn. Compact asks Claude Code to summarize it, so the next step starts from the summary: it uses less of your plan, and may forget details.';

type Latest = NonNullable<SessionCompactionView['latest']>;

/** What the session holds now, and where the last compaction (Union's) took it from. */
function sizeText(view: SessionCompactionView, latest: Latest | null): string {
  const context = view.session?.context ?? null;
  const now = context === null ? 'Size not known yet' : `${thousands(context)} tokens of context`;
  return latest?.status === 'succeeded' && latest.contextBefore !== null
    ? `${now} · compacted from ${thousands(latest.contextBefore)}`
    : now;
}

function Action({
  latest,
  refusal,
  state,
}: {
  latest: Latest | null;
  refusal: string | null;
  state: ReturnType<typeof useSessionCompaction>;
}): ReactElement {
  if (latest?.status === 'queued' || latest?.status === 'running') {
    return (
      <span className="flex items-center gap-2 text-xs text-zinc-500">
        {latest.status === 'queued' ? 'Waiting for a run slot…' : 'Compacting…'}
        <Button
          size="sm"
          disabled={state.busy}
          onClick={() => {
            state.handleCancel(latest.id);
          }}
        >
          Cancel
        </Button>
      </span>
    );
  }
  return (
    <Button
      size="sm"
      disabled={state.busy || refusal !== null}
      title={refusal ?? HINT}
      onClick={state.handleCompact}
    >
      Compact
    </Button>
  );
}

/** Nothing until the implementation ran: there is no session to compact before. */
export function SessionCompaction({ ticketId }: { ticketId: number }): ReactElement | null {
  const state = useSessionCompaction(ticketId);
  const { view } = state;
  if (!view?.session) {
    return null;
  }
  const { latest } = view;
  return (
    <section className="space-y-1" aria-label="Implementer session">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold tracking-wider text-zinc-500 uppercase">
          Implementer session
        </h3>
        <span className="flex flex-wrap items-center gap-3 text-sm" title={HINT}>
          {sizeText(view, latest)}
          <Action latest={latest} refusal={view.refusal} state={state} />
        </span>
      </div>
      {latest?.status === 'failed' && latest.error !== null ? (
        <p className="text-xs text-red-600 dark:text-red-400">
          The last compaction failed: {latest.error}
        </p>
      ) : null}
      <ErrorText error={state.error} />
    </section>
  );
}

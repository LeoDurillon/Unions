// Compacts a ticket's implementer session: `/compact` resumed in it, in the ticket's container.

import {
  IMPLEMENT_DENIED,
  appendAgentLine,
  effortFor,
  getTicket,
  implementerSession,
  modelFor,
  type SessionCompaction,
  type SessionCompactionOutcome,
  toolsFor,
} from '@union/core';

import { agentFailure, runAgent, type AgentFn } from '../agent/agent';
import { ensureTicketContainer, REPO_DIR } from '../provision';
import type { TargetDeps } from '../review/agent-review-target';
import type { RunSlots } from '../slots';

export type CompactionDeps = TargetDeps & { slots: RunSlots; agent?: AgentFn };

/** The CLI's own command: it summarizes the conversation and keeps the session's id. */
const COMPACT_PROMPT = '/compact';

/** Why the compaction cannot run now, though it was allowed when queued; null when it can. */
function staleReason(deps: CompactionDeps, row: SessionCompaction): string | null {
  const ticket = getTicket(deps.db, row.ticketId);
  if (ticket.phase.kind === 'running') {
    return 'A step started on the ticket: compact once it ends';
  }
  return implementerSession(deps.db, row.ticketId) === row.sessionId
    ? null
    : 'The implementer moved to another session since: compact again';
}

/**
 * Resumes the implementer's session with `/compact`, on the implementer's model so its cache is
 * read. A lost session fails: there is nothing to compact.
 */
export async function compactSession(
  deps: CompactionDeps,
  row: SessionCompaction,
  signal: AbortSignal,
): Promise<SessionCompactionOutcome> {
  const { db, runtime } = deps;
  const stale = staleReason(deps, row);
  if (stale !== null) {
    return { status: 'failed', error: stale };
  }
  const ticket = getTicket(db, row.ticketId);
  const { name } = await ensureTicketContainer(db, runtime, deps.config, ticket);
  const log = (event: unknown): void => {
    appendAgentLine(db, { ticketId: ticket.id, payload: event });
  };
  log({ type: 'union_session_compaction', sessionId: row.sessionId });
  try {
    const outcome = await (deps.agent ?? runAgent)(runtime, {
      container: name,
      cwd: REPO_DIR,
      model: modelFor(db, 'implement'),
      effort: effortFor(db, 'implement'),
      prompt: COMPACT_PROMPT,
      tools: toolsFor(db, 'implement'),
      denied: IMPLEMENT_DENIED,
      resumeSessionId: row.sessionId,
      signal,
      onEvent: log,
    });
    return outcome.kind === 'ok'
      ? { status: 'succeeded' }
      : { status: 'failed', error: agentFailure(outcome) };
  } finally {
    // A run the user started meanwhile works in the same container: it stops it itself.
    if (getTicket(db, ticket.id).phase.kind !== 'running') {
      await runtime.stop(name);
    }
  }
}

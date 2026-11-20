// How a ticket shows its implementer session's size: `341k`, amber when large, and what it means on hover.

import type { TicketSummary } from '../../../src/api-types';

/** Above it, a session costs the most on every turn: it is shown in amber. */
const LARGE_CONTEXT = 150_000;
const TOKENS_PER_K = 1000;

/** `341k`. */
export function thousands(tokens: number): string {
  return `${Math.round(tokens / TOKENS_PER_K)}k`;
}

export type SessionContextLabel = { text: string; large: boolean; title: string };

/** The size while the ticket can still resume its session; null once it is done, or without one. */
export function sessionContextLabel(ticket: TicketSummary): SessionContextLabel | null {
  const context = ticket.sessionContext ?? null;
  if (context === null || ticket.phase.kind === 'done' || ticket.phase.kind === 'cancelled') {
    return null;
  }
  const text = thousands(context);
  return {
    text,
    large: context > LARGE_CONTEXT,
    title: `Implementer session: ${text} tokens of context, read again on every turn of its next step. Compact it from the ticket's Overview.`,
  };
}

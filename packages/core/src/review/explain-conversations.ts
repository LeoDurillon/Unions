// The Explain conversations of a review: listed, titled, renamed and deleted; their turns are in review-explanations.ts.

import { and, desc, eq, inArray, type SQL } from 'drizzle-orm';

import type { Db } from '../db';
import * as schema from '../tables';
import { emitEvent } from '../ticket/tickets';
import type { AgentReviewOwner } from './agent-reviews';
import { conversationTitle } from './explain-subjects';

export type ExplainConversation = typeof schema.reviewExplainConversations.$inferSelect;

type Executor = Parameters<typeof emitEvent>[0];

/** A conversation's turn still waits for or gets an answer. */
export class ConversationBusyError extends Error {}

function conversationOwnedBy(owner: AgentReviewOwner): SQL {
  const table = schema.reviewExplainConversations;
  return owner.kind === 'ticket' ? eq(table.ticketId, owner.id) : eq(table.reviewId, owner.id);
}

/** Every change is an event: the review page refetches its conversations on it. */
export function conversationChanged(
  db: Executor,
  conversation: ExplainConversation,
  removed = false,
): void {
  emitEvent(db, {
    type: 'review_explain_conversation_changed',
    ticketId: conversation.ticketId ?? undefined,
    payload: { conversationId: conversation.id, reviewId: conversation.reviewId, removed },
  });
}

export function createConversation(
  db: Executor,
  owner: AgentReviewOwner,
  title: string,
): ExplainConversation {
  return db
    .insert(schema.reviewExplainConversations)
    .values({
      ...(owner.kind === 'ticket' ? { ticketId: owner.id } : { reviewId: owner.id }),
      title,
    })
    .returning()
    .get();
}

/** The review's conversations, the one asked or renamed last first. */
export function conversationsOf(db: Db, owner: AgentReviewOwner): ExplainConversation[] {
  const table = schema.reviewExplainConversations;
  return db
    .select()
    .from(table)
    .where(conversationOwnedBy(owner))
    .orderBy(desc(table.updatedAt), desc(table.id))
    .all();
}

/** The conversation when the review owns it; null otherwise. */
export function ownedConversation(
  db: Executor,
  owner: AgentReviewOwner,
  id: number,
): ExplainConversation | null {
  const table = schema.reviewExplainConversations;
  return (
    db
      .select()
      .from(table)
      .where(and(eq(table.id, id), conversationOwnedBy(owner)))
      .get() ?? null
  );
}

export function renameConversation(
  db: Db,
  conversation: ExplainConversation,
  title: string,
): ExplainConversation {
  const renamed = db
    .update(schema.reviewExplainConversations)
    .set({ title: conversationTitle(title, []), updatedAt: Date.now() })
    .where(eq(schema.reviewExplainConversations.id, conversation.id))
    .returning()
    .get();
  conversationChanged(db, renamed);
  return renamed;
}

/** Deletes the conversation and its turns; refused while one waits or runs (cancel it first). */
export function deleteConversation(db: Db, conversation: ExplainConversation): void {
  db.transaction((tx) => {
    const turns = schema.reviewExplanations;
    const active = tx
      .select({ id: turns.id })
      .from(turns)
      .where(
        and(
          eq(turns.conversationId, conversation.id),
          inArray(turns.status, ['queued', 'running']),
        ),
      )
      .get();
    if (active) {
      throw new ConversationBusyError('Cancel the question being answered first');
    }
    tx.delete(schema.reviewExplainConversations)
      .where(eq(schema.reviewExplainConversations.id, conversation.id))
      .run();
    conversationChanged(tx, conversation, true);
  });
}

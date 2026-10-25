// After a revision is pushed, asks the implementer for a reply to each comment imported from GitHub it worked on, kept as drafts the user sends.
import {
  effortFor,
  emitEvent,
  getTicket,
  modelFor,
  quoteReply,
  resolveAgent,
  schema,
  toolsFor,
  type ContainerRuntime,
  type Db,
} from '@union/core';
import { and, eq, inArray } from 'drizzle-orm';

import type { AgentFn } from './agent';
import { IMPLEMENT_DENIED } from './implement-loop';
import { importedNote, repliesOf, repliesPrompt, type SuggestedReply } from './pr-reply-format';
import { REPO_DIR } from './provision';

/** What the replies turn needs: the implementer's session to resume, and where it logs. */
export type ReplyWriter = {
  db: Db;
  runtime: ContainerRuntime;
  agent: AgentFn;
  container: string;
  ticketId: number;
  sessionId: string | null;
  signal: AbortSignal;
  log: (event: unknown) => void;
};

type Row = typeof schema.reviewComments.$inferSelect;

/** The comments Send review asked replies for: imported from GitHub and sent to the implementer. */
function requested(db: Db, ticketId: number): Row[] {
  return db
    .select()
    .from(schema.reviewComments)
    .where(
      and(
        eq(schema.reviewComments.ticketId, ticketId),
        eq(schema.reviewComments.status, 'sent'),
        eq(schema.reviewComments.replyStatus, 'requested'),
      ),
    )
    .orderBy(schema.reviewComments.id)
    .all();
}

/** A conversation comment cannot be threaded: its reply quotes it, as GitHub's Quote reply does. */
function replyText(row: Row, reply: SuggestedReply): string {
  const note = row.kind === 'general' ? importedNote(row.body) : null;
  return note ? quoteReply(note, reply.body) : reply.body;
}

/** The drafts written; the comments without a reply are no longer asked for. */
function save(db: Db, rows: readonly Row[], replies: readonly SuggestedReply[]): void {
  db.transaction((tx) => {
    for (const reply of replies) {
      const row = rows.find((candidate) => candidate.id === reply.id);
      if (row) {
        tx.update(schema.reviewComments)
          .set({
            replyStatus: 'draft',
            replyBody: replyText(row, reply),
            replyAuthor: 'agent',
            replyResolve: reply.resolve,
            replyError: null,
          })
          .where(eq(schema.reviewComments.id, row.id))
          .run();
      }
    }
    const left = rows.filter((row) => !replies.some((reply) => reply.id === row.id));
    if (left.length > 0) {
      tx.update(schema.reviewComments)
        .set({ replyStatus: null })
        .where(
          inArray(
            schema.reviewComments.id,
            left.map((row) => row.id),
          ),
        )
        .run();
    }
  });
}

async function ask(writer: ReplyWriter, rows: readonly Row[]): Promise<SuggestedReply[]> {
  const { db } = writer;
  const outcome = await writer.agent(writer.runtime, {
    container: writer.container,
    cwd: REPO_DIR,
    model: modelFor(db, 'pr_replies'),
    effort: effortFor(db, 'pr_replies'),
    prompt: repliesPrompt(resolveAgent(db, 'pr_replies').prompt, rows),
    // Reading only: the work is pushed already.
    tools: toolsFor(db, 'pr_replies'),
    denied: IMPLEMENT_DENIED,
    resumeSessionId: writer.sessionId,
    signal: writer.signal,
    onEvent: writer.log,
  });
  if (outcome.kind !== 'ok') {
    throw new Error(`The replies turn ended with ${outcome.kind}`);
  }
  return repliesOf(outcome.text, rows);
}

/**
 * Drafts a reply to each comment Send review asked one for, in the implementer's session once its
 * revision is pushed; returns how many were written. A failed turn is logged and never fails the step:
 * the comments are no longer asked for, and the user can still reply by hand.
 */
export async function suggestReplies(writer: ReplyWriter): Promise<number> {
  const { db, ticketId } = writer;
  const rows = requested(db, ticketId);
  if (rows.length === 0) {
    return 0;
  }
  let replies: SuggestedReply[] = [];
  try {
    replies = await ask(writer, rows);
  } catch (error) {
    writer.log({ type: 'union_pr_replies_failed', error: String(error) });
  }
  save(db, rows, replies);
  const { prNumber } = getTicket(db, ticketId);
  if (replies.length > 0 && prNumber !== null) {
    emitEvent(db, {
      type: 'pr_replies_suggested',
      ticketId,
      payload: { number: prNumber, count: replies.length },
    });
  }
  return replies.length;
}

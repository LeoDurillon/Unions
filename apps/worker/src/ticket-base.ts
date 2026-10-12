import { emitEvent, parentOf, schema, ticketLabel, type Db, type Ticket } from '@union/core';
import { eq } from 'drizzle-orm';

import type { CloneSource } from './provision';

async function remoteHasBranch(source: CloneSource, branch: string): Promise<boolean> {
  const proc = Bun.spawn(['git', 'ls-remote', '--heads', source.url, `refs/heads/${branch}`], {
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  const [output, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  if (code !== 0) {
    const stderr = await new Response(proc.stderr).text();
    const safe = source.secret ? stderr.replaceAll(source.secret, '***') : stderr;
    throw new Error(`git ls-remote failed: ${safe.trim()}`);
  }
  return output.trim() !== '';
}

/**
 * Chooses the branch a ticket is cloned from, before its first clone: the parent's branch while it
 * exists on GitHub, else the project's base branch (a parent merged with its branch deleted is
 * already in it). Stored on the ticket so the implementation, review and PR use the same base.
 */
export async function resolveTicketBase(
  db: Db,
  ticket: Ticket,
  source: CloneSource,
): Promise<string | null> {
  const parent = parentOf(db, ticket);
  let base: string | null = null;
  if (parent?.branch) {
    base = (await remoteHasBranch(source, parent.branch)) ? parent.branch : null;
    if (base === null) {
      emitEvent(db, {
        type: 'parent_branch_missing',
        ticketId: ticket.id,
        payload: { parent: ticketLabel(parent), branch: parent.branch },
      });
    }
  }
  db.update(schema.tickets).set({ baseBranch: base }).where(eq(schema.tickets.id, ticket.id)).run();
  return base;
}

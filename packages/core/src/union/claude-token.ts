// The long-lived Claude token the agents run with: read, checked, saved, removed; the browser only learns if one is set.
import { eq } from 'drizzle-orm';

import type { Db } from '../db';
import * as schema from '../tables';

const TOKEN_ROW = 1;

/** What `claude setup-token` prints: an OAuth access token, without a refresh token. */
const TOKEN_SHAPE = /^sk-ant-oat01-[\w-]{20,}$/u;

/** Whether a token is set, and when it was saved: all the browser is told. */
export type ClaudeTokenStatus = { configured: false } | { configured: true; savedAt: number };

/** Why a pasted token cannot be the one `claude setup-token` printed; null when it can. */
export function claudeTokenProblem(token: string): string | null {
  if (token.startsWith('sk-ant-ort01-')) {
    return 'This is a refresh token: paste the token `claude setup-token` printed';
  }
  if (token.startsWith('sk-ant-api')) {
    return 'This is an API key: agents run on your subscription, paste the token `claude setup-token` printed';
  }
  return TOKEN_SHAPE.test(token)
    ? null
    : 'Not a Claude token: paste the token `claude setup-token` printed (it starts with sk-ant-oat01-)';
}

/** The token the agents run with; null: they get a copy of the host's login. */
export function claudeToken(db: Db): string | null {
  return (
    db.select().from(schema.claudeToken).where(eq(schema.claudeToken.id, TOKEN_ROW)).get()?.token ??
    null
  );
}

export function claudeTokenStatus(db: Db): ClaudeTokenStatus {
  const row = db
    .select()
    .from(schema.claudeToken)
    .where(eq(schema.claudeToken.id, TOKEN_ROW))
    .get();
  return row ? { configured: true, savedAt: row.savedAt } : { configured: false };
}

/** Saves a token already checked with `claudeTokenProblem`, replacing the one before. */
export function saveClaudeToken(db: Db, token: string): void {
  const values = { token, savedAt: Date.now() };
  db.insert(schema.claudeToken)
    .values({ id: TOKEN_ROW, ...values })
    .onConflictDoUpdate({ target: schema.claudeToken.id, set: values })
    .run();
}

export function deleteClaudeToken(db: Db): void {
  db.delete(schema.claudeToken).where(eq(schema.claudeToken.id, TOKEN_ROW)).run();
}

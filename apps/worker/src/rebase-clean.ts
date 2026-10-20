// A rebase git did alone: the branch already up to date, or rebased with no conflict, checked and pushed.
import { schema } from '@union/core';
import { eq } from 'drizzle-orm';

import { forcePush } from './branch-push';
import { runGate } from './gate';
import { renderCleanReport, type Rebase } from './rebase-agent';
import { afterPush } from './rebase-publish';
import type { StepResult } from './scheduler';

/** Checks that fail after a clean rebase: the agent fixes what the base's changes broke. */
export type ChecksFailed = { checksFailed: { command: string; exitCode: number; tail: string } };

/** Nothing to rebase: the branch already holds its base. Nothing is pushed. */
export function upToDate(rebase: Rebase): StepResult {
  const { deps, context, base } = rebase;
  deps.db
    .update(schema.tickets)
    .set({ behindBy: 0 })
    .where(eq(schema.tickets.id, context.ticket.id))
    .run();
  const output = `**Already up to date** with \`origin/${base}\`: nothing to rebase, nothing pushed. No agent ran.`;
  return { kind: 'ok', output, clean: true };
}

/** After a clean rebase: the project's checks, then the push with the lease. */
export async function pushClean(rebase: Rebase, lease: string): Promise<StepResult | ChecksFailed> {
  const { deps, container, project } = rebase;
  const { gateCommand } = project.config;
  await deps.services?.ensure();
  const gate = gateCommand
    ? await runGate(deps.runtime, container, gateCommand, rebase.context.signal)
    : null;
  if (gate && gateCommand && !gate.green) {
    return { checksFailed: { command: gateCommand, exitCode: gate.exitCode, tail: gate.tail } };
  }
  const refused = await forcePush(rebase, lease);
  if (refused !== null) {
    return { kind: 'error', error: refused };
  }
  const output = renderCleanReport({ rebase, after: await afterPush(rebase), gateCommand, gate });
  return { kind: 'ok', output, clean: true };
}

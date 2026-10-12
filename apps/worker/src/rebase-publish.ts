import { emitEvent, schema, type Project } from '@union/core';
import { eq } from 'drizzle-orm';

import { captureDiff } from './diff-snapshot';
import { runGate, type GateResult } from './gate';
import { projectRemote, pushBranch } from './publish';
import { renderRebaseReport, type Pushed, type Rebase } from './rebase-agent';
import { headCommit, rebaseProblem } from './rebase-git';
import type { StepResult } from './scheduler';
import { commitLeftovers } from './workspace-git';

/** The project's repository with its credentials, for the fetch and the push. */
export function remoteOf(deps: Rebase['deps'], project: Project): ReturnType<typeof projectRemote> {
  return projectRemote(deps.db, deps.config.gitBaseUrl, project);
}

/** Checks the result, runs the project's checks, then pushes; returns why it could not, or the gate. */
export async function verifyAndPush(
  rebase: Rebase,
  pushed: string,
): Promise<{ error: string } | { gate: GateResult | null }> {
  const { deps, container, project, branch } = rebase;
  await commitLeftovers(deps.runtime, container);
  const problem = await rebaseProblem(deps.runtime, container, rebase);
  if (problem) {
    return { error: problem };
  }
  const { gateCommand } = project.config;
  const gate = gateCommand
    ? await runGate(deps.runtime, container, gateCommand, rebase.context.signal)
    : null;
  if (gate && !gate.green) {
    return {
      error: `The checks fail after the rebase (exit ${gate.exitCode}):\n\n\`\`\`\n${gate.tail}\n\`\`\``,
    };
  }
  try {
    await pushBranch(deps.runtime, container, await remoteOf(deps, project), {
      branch,
      lease: pushed,
    });
  } catch (error) {
    return {
      error: `The push was refused (did someone push to \`${branch}\` meanwhile?): ${String(error)}`,
    };
  }
  return { gate };
}

/** After the push: the branch is current, the review diff is refreshed, and the report is the output. */
export async function published(rebase: Rebase, { outcome, gate }: Pushed): Promise<StepResult> {
  const { deps, context, container, branch, base } = rebase;
  const ticketId = context.ticket.id;
  emitEvent(deps.db, { type: 'branch_pushed', ticketId, payload: { branch, rebased: true } });
  deps.db.update(schema.tickets).set({ behindBy: 0 }).where(eq(schema.tickets.id, ticketId)).run();
  await captureDiff(deps.db, deps.runtime, { container, ticketId, base }).catch(
    (error: unknown) => {
      context.log({ type: 'union_diff_failed', error: String(error) });
    },
  );
  const output = renderRebaseReport({
    agentReport: outcome.text,
    rebase,
    after: await headCommit(deps.runtime, container),
    gateCommand: rebase.project.config.gateCommand,
    gate,
  });
  return { kind: 'ok', output, sessionId: outcome.sessionId };
}

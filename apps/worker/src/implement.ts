// Implements the approved plan on the ticket's branch, checks it, pushes it, opens the draft PR.
import { captureDiff } from './diff-snapshot';
import { implementerAsk, type ImplementDeps } from './implement-loop';
import { renderImplementReport } from './implement-prompts';
import { implement, prepare, resume, type Implemented, type Prepared } from './implement-run';
import { publishBranch, type PublishResult } from './publish';
import type { StepContext, StepResult } from './scheduler';
import { pushRevision, restackRevision, stackSection } from './stack-revise';
import { commitsAhead } from './workspace-git';

export type { ImplementDeps } from './implement-loop';

function restackNote({ changed, conflicts }: { changed: number[]; conflicts: number }): string {
  const resolved =
    conflicts === 0
      ? ''
      : ` (the implementer resolved ${conflicts === 1 ? 'a conflict' : `${conflicts} conflicts`} on the way)`;
  return `**Restacked:** the new commits went into slice ${changed.join(', ')}; the slices above moved with them${resolved}, and every slice was force-pushed.`;
}

/** A split ticket's revision is moved into its slices and the stack pushed; else the branch is pushed. */
async function publish(
  workspace: Prepared,
  { loop }: Implemented,
): Promise<{ result: PublishResult; note: string | null } | { error: string }> {
  const { deps, context, project, container, branch, base } = workspace;
  const restacked = await restackRevision(
    workspace,
    implementerAsk(workspace, loop.outcome.sessionId),
  );
  if (restacked && 'error' in restacked) {
    return { error: restacked.error };
  }
  await captureDiff(deps.db, deps.runtime, { container, ticketId: context.ticket.id, base }).catch(
    (error: unknown) => {
      context.log({ type: 'union_diff_failed', error: String(error) });
    },
  );
  if (restacked) {
    return { result: await pushRevision(workspace), note: restackNote(restacked) };
  }
  const result = await publishBranch({
    ...deps,
    github: deps.github(project),
    project,
    ticket: context.ticket,
    container,
    branch,
    base,
    describer: {
      db: deps.db,
      agent: deps.agent,
      sessionId: loop.outcome.sessionId,
      signal: context.signal,
      log: context.log,
    },
  });
  return { result, note: null };
}

async function publishAndReport(workspace: Prepared, done: Implemented): Promise<StepResult> {
  const { deps, project, container, branch, base } = workspace;
  const { loop } = done;
  const published = await publish(workspace, done);
  if ('error' in published) {
    return {
      kind: 'error',
      error: `${published.error}\n\nThe agent's report:\n\n${loop.outcome.text}`,
    };
  }
  const note = [done.note, published.note]
    .filter((text) => text !== undefined && text !== null)
    .join('\n\n');
  const output = renderImplementReport({
    agentReport: loop.outcome.text,
    gateCommand: project.config.gateCommand,
    gate: loop.gate,
    iterations: loop.iterations,
    branch,
    ahead: await commitsAhead(deps.runtime, container, base, branch),
    base,
    publish: published.result,
    ...(note === '' ? {} : { note }),
  });
  return { kind: 'ok', output, sessionId: loop.outcome.sessionId };
}

/** Implements the approved plan on the ticket's branch, checks it, pushes it, opens the draft PR. */
export async function runImplementStep(
  deps: ImplementDeps,
  context: StepContext,
): Promise<StepResult> {
  const prepared = await prepare(deps, context);
  const workspace = { ...prepared, stackSection: await stackSection(prepared) };
  try {
    const done = context.resume ? await resume(workspace) : await implement(workspace);
    return 'loop' in done ? await publishAndReport(workspace, done) : done;
  } finally {
    await deps.runtime.stop(workspace.container);
  }
}

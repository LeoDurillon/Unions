import { captureDiff } from './diff-snapshot';
import type { ImplementDeps } from './implement-loop';
import { renderImplementReport } from './implement-prompts';
import { implement, prepare, resume, type Implemented, type Prepared } from './implement-run';
import { publishBranch } from './publish';
import type { StepContext, StepResult } from './scheduler';
import { commitsAhead } from './workspace-git';

export { IMPLEMENT_DENIED, type ImplementDeps } from './implement-loop';

async function publishAndReport(
  workspace: Prepared,
  { loop, note }: Implemented,
): Promise<StepResult> {
  const { deps, context, project, container, branch, base } = workspace;
  await captureDiff(deps.db, deps.runtime, { container, ticketId: context.ticket.id, base }).catch(
    (error: unknown) => {
      context.log({ type: 'union_diff_failed', error: String(error) });
    },
  );
  const publish = await publishBranch({
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
  const output = renderImplementReport({
    agentReport: loop.outcome.text,
    gateCommand: project.config.gateCommand,
    gate: loop.gate,
    iterations: loop.iterations,
    branch,
    ahead: await commitsAhead(deps.runtime, container, base, branch),
    base,
    publish,
    ...(note ? { note } : {}),
  });
  return { kind: 'ok', output, sessionId: loop.outcome.sessionId };
}

/** Implements the approved plan on the ticket's branch, checks it, pushes it, opens the draft PR. */
export async function runImplementStep(
  deps: ImplementDeps,
  context: StepContext,
): Promise<StepResult> {
  const workspace = await prepare(deps, context);
  try {
    const done = context.resume ? await resume(workspace) : await implement(workspace);
    return 'loop' in done ? await publishAndReport(workspace, done) : done;
  } finally {
    await deps.runtime.stop(workspace.container);
  }
}

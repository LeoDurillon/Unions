import {
  type ContainerRuntime,
  type Db,
  effortFor,
  listAttachments,
  modelFor,
  parentOf,
  type Project,
  resolveAgent,
  sharedPrompt,
  toolsFor,
} from '@union/core';

import { runResumable, type AgentFn, type AgentOutcome } from './agent';
import { approvedBefore } from './approved';
import { runGate, runInstall, type GateResult } from './gate';
import type { GitHubApi } from './github/api';
import { feedbackPrompt, gateFailurePrompt, gateHint } from './implement-prompts';
import { COMMIT_HOOK_HINT, commitLeftovers, type Refused } from './leftovers';
import { attachmentsSection, buildPrompt } from './prompts';
import { REPO_DIR, type ProvisionConfig } from './provision';
import type { StepContext } from './scheduler';

/** Branch moves and history rewrites belong to the host (rebase has its own step). */
export const IMPLEMENT_DENIED = [
  'Bash(git checkout*)',
  'Bash(git switch*)',
  'Bash(git rebase*)',
  'Bash(git reset*)',
  'Bash(git merge*)',
  'Bash(git worktree*)',
  'Bash(git branch -D*)',
] as const;
const DEFAULT_MAX_ITERATIONS = 3;

export type ImplementDeps = {
  db: Db;
  runtime: ContainerRuntime;
  config: ProvisionConfig;
  github: (project: Project) => GitHubApi | null;
  agent: AgentFn;
};

export type Loop = {
  outcome: AgentOutcome;
  gate: GateResult | null;
  iterations: number;
  /** The repository's hook refused the changes the agent left uncommitted: the run pauses. */
  refused?: Refused;
};
export type Workspace = {
  deps: ImplementDeps;
  context: StepContext;
  project: Project;
  container: string;
};

/** Everything a new session needs: task, approved plan, instructions, and the feedback if any. */
function freshPrompt({ deps, context, project }: Workspace): string {
  const { ticket, revision } = context;
  const prompt = buildPrompt({
    ticket,
    parent: parentOf(deps.db, ticket),
    shared: sharedPrompt(deps.db, ticket.projectId),
    instructions:
      resolveAgent(deps.db, 'implement').prompt +
      gateHint(project.config.gateCommand) +
      COMMIT_HOOK_HINT,
    approved: approvedBefore(deps.db, ticket.id, 'implement'),
    revision: null,
    attachments: listAttachments(deps.db, ticket.id),
  });
  return revision ? `${prompt}\n\n${feedbackPrompt(revision.feedback)}` : prompt;
}

/** A resumed session already knows the task: only the feedback is sent, with the files as they are now. */
function firstPrompt(workspace: Workspace): string {
  const { revision, resumeSessionId, ticket } = workspace.context;
  if (!revision || !resumeSessionId) {
    return freshPrompt(workspace);
  }
  const attachments = listAttachments(workspace.deps.db, ticket.id);
  return attachments.length === 0
    ? feedbackPrompt(revision.feedback)
    : `${feedbackPrompt(revision.feedback)}\n\n${attachmentsSection(attachments)}`;
}

/** Agent turn, then checks; on red checks the same session gets the failure, up to the limit. */
export async function implementLoop(workspace: Workspace): Promise<Loop> {
  const { deps, context, project, container } = workspace;
  const { gateCommand, maxIterations } = project.config;
  const max = maxIterations ?? DEFAULT_MAX_ITERATIONS;
  let prompt = firstPrompt(workspace);
  let sessionId = context.resumeSessionId;
  let gate: GateResult | null = null;
  for (let iteration = 1; ; iteration++) {
    const outcome = await runResumable(
      deps.agent,
      deps.runtime,
      {
        container,
        cwd: REPO_DIR,
        model: modelFor(deps.db, 'implement'),
        effort: effortFor(deps.db, 'implement'),
        prompt,
        tools: toolsFor(deps.db, 'implement'),
        denied: IMPLEMENT_DENIED,
        resumeSessionId: sessionId,
        signal: context.signal,
        onEvent: context.log,
      },
      freshPrompt(workspace),
    );
    if (outcome.kind !== 'ok') {
      return { outcome, gate, iterations: iteration };
    }
    ({ sessionId } = outcome);
    const leftovers = await commitLeftovers(deps.runtime, container);
    if (leftovers.kind === 'refused') {
      return { outcome, gate: null, iterations: iteration, refused: leftovers };
    }
    gate = gateCommand ? await runGate(deps.runtime, container, gateCommand, context.signal) : null;
    if (!gate || gate.green || !gateCommand || iteration >= max) {
      return { outcome, gate, iterations: iteration };
    }
    context.log({ type: 'union_gate', green: false, exitCode: gate.exitCode, iteration });
    prompt = gateFailurePrompt(gateCommand, gate);
  }
}

export function install(workspace: Workspace): Promise<string | null> {
  const { installCommand } = workspace.project.config;
  return installCommand
    ? runInstall(
        workspace.deps.runtime,
        workspace.container,
        installCommand,
        workspace.context.signal,
      )
    : Promise.resolve(null);
}

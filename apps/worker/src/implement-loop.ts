import {
  type AgentSetup,
  type ContainerRuntime,
  type Db,
  effortFor,
  getPreview,
  listAttachments,
  listProjectFiles,
  markAgentInputsSent,
  modelFor,
  pendingAgentInputs,
  type Project,
  resolveAgent,
  sharedPrompt,
  toolsFor,
} from '@union/core';

import { runResumable, type AgentFn, type AgentOutcome, type AgentRun } from './agent';
import { approvedBefore } from './approved';
import type { GitHubApi } from './github/api';
import { check, type Checked } from './implement-checks';
import {
  agentServicesHint,
  feedbackPrompt,
  givenOutputsPrompt,
  gateHint,
  previewHint,
} from './implement-prompts';
import { askSession, COMMIT_HOOK_HINT, commitLeftovers, type Refused } from './leftovers';
import { attachmentsSection, buildPrompt, parentContext } from './prompts';
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
  /** The agent's services for this step, when the project starts some. */
  services?: AgentSetup | null;
};

export type Loop = {
  outcome: AgentOutcome;
  gate: Checked['gate'];
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
    ...parentContext(deps.db, ticket),
    shared: sharedPrompt(deps.db, ticket.projectId),
    instructions:
      resolveAgent(deps.db, 'implement').prompt +
      gateHint(project.config.gateCommand) +
      previewHint(
        project.config.preview,
        getPreview(deps.db, { ticketId: ticket.id })?.status === 'running',
      ) +
      agentServicesHint(deps.services) +
      COMMIT_HOOK_HINT,
    approved: approvedBefore(deps.db, ticket.id, 'implement'),
    revision: null,
    step: 'implement',
    attachments: listAttachments(deps.db, ticket.id),
    projectFiles: listProjectFiles(deps.db, ticket.projectId),
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

/** The prompt plus the outputs the user gave the agent, when there are any. */
function withOutputs(prompt: string, outputs: string): string {
  return outputs === '' ? prompt : `${prompt}\n\n${outputs}`;
}

/**
 * Agent turn, then checks; on red checks the same session gets the failure, up to the limit. The
 * command and CI outputs the user gave the agent go with the first turn, and count as read once it ran.
 */
export async function implementLoop(workspace: Workspace): Promise<Loop> {
  const { deps, context, project, container } = workspace;
  const max = project.config.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const given = pendingAgentInputs(deps.db, context.ticket.id);
  const outputs = givenOutputsPrompt(given);
  let prompt = withOutputs(firstPrompt(workspace), outputs);
  let sessionId = context.resumeSessionId;
  let gate: Checked['gate'] = null;
  const run = (): AgentRun => ({
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
  });
  for (let iteration = 1; ; iteration++) {
    const fresh = withOutputs(freshPrompt(workspace), iteration === 1 ? outputs : '');
    const outcome = await runResumable(deps.agent, deps.runtime, run(), fresh);
    if (outcome.kind !== 'ok') {
      return { outcome, gate, iterations: iteration };
    }
    if (iteration === 1) {
      markAgentInputsSent(deps.db, given);
    }
    ({ sessionId } = outcome);
    const leftovers = await commitLeftovers(deps.runtime, container, {
      report: outcome.text,
      ask: askSession(deps.agent, deps.runtime, run()),
    });
    if (leftovers.kind === 'refused') {
      return { outcome, gate: null, iterations: iteration, refused: leftovers };
    }
    const checked = await check(workspace);
    ({ gate } = checked);
    if (checked.retry === null || iteration >= max) {
      return { outcome, gate, iterations: iteration };
    }
    prompt = checked.retry;
  }
}

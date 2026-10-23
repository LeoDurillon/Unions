// Runs queued investigations, each in a throwaway container (`union-i<id>`), and builds their
// prompt.
import {
  appendAgentLine,
  claimInvestigation,
  type ContainerRuntime,
  type Db,
  DIAGRAM_INSTRUCTION,
  emitEvent,
  failInterruptedInvestigations,
  finishInvestigation,
  type Investigation,
  type InvestigationOutcome,
  type NotionApi,
  type Project,
  projectInstructions,
  schema,
} from '@union/core';
import { eq } from 'drizzle-orm';

import { runAgent, type AgentFn, type AgentOutcome } from './agent';
import { projectGitToken } from './credentials';
import { runOnTicket } from './investigate-ticket';
import { TicketDrafter } from './investigation-ticket';
import {
  cloneInto,
  cloneSource,
  REPO_DIR,
  seedCredentials,
  type ProvisionConfig,
  type TicketContainer,
} from './provision';
import { RunPool } from './run-pool';
import type { RunSlots } from './slots';

/** Where a global investigation runs: the empty workspace volume, no repository. */
const GLOBAL_DIR = '/workspace';

function investigationContainer(id: number): TicketContainer {
  return {
    name: `union-i${id}`,
    homeVolume: `union-i${id}-home`,
    workspaceVolume: `union-i${id}-ws`,
  };
}

/** The earlier questions and answers a follow-up builds on; empty for a first question. */
function earlierExchanges(investigation: Investigation): string {
  if (investigation.history.length === 0) {
    return '';
  }
  const exchanges = investigation.history.map(
    ({ prompt, answer }) => `<question>\n${prompt}\n</question>\n<answer>\n${answer}\n</answer>`,
  );
  return `This follows up on an earlier investigation. The questions asked so far and your answers, oldest first:

${exchanges.join('\n\n')}

The follow-up question:

`;
}

/**
 * The user's prompt (after the earlier exchanges, if any), then where the agent stands and what to
 * hand back. `ticketWhere` says where a `ticket` investigation stands.
 */
export function investigationPrompt(
  investigation: Investigation,
  project: Project,
  ticketWhere = '',
): string {
  const where = {
    ticket: ticketWhere,
    repository: `The repository ${project.owner}/${project.repo} is checked out at ${REPO_DIR} on its \`${project.config.baseBranch}\` branch. Read the code to answer; do not change it.`,
    global: `No repository is checked out: this is a general question for the team working on ${project.owner}/${project.repo}. Answer from your knowledge and the tools you have.`,
  }[investigation.scope];
  const own = projectInstructions(project);
  return `${earlierExchanges(investigation)}${investigation.prompt}

---
${own === '' ? '' : `${own}\n\n`}${where}
Output only your findings as markdown: the answer first, then the evidence (files, links) it rests on.
${DIAGRAM_INSTRUCTION}`;
}

export type InvestigationDeps = {
  db: Db;
  runtime: ContainerRuntime;
  config: ProvisionConfig;
  slots: RunSlots;
  agent?: AgentFn;
  /** Notion, for tickets written from investigations; tests substitute a fake. */
  notion?: NotionApi;
};

function toOutcome(outcome: AgentOutcome, cancelled: boolean): InvestigationOutcome {
  if (cancelled) {
    return { status: 'cancelled' };
  }
  if (outcome.kind === 'ok') {
    return { status: 'succeeded', result: outcome.text };
  }
  const prefix = outcome.kind === 'rate_limited' ? 'Usage limit reached: ' : '';
  return { status: 'failed', error: `${prefix}${outcome.message}` };
}

async function removeContainer(deps: InvestigationDeps, id: number): Promise<void> {
  const names = investigationContainer(id);
  try {
    await deps.runtime.remove(names.name, {
      home: names.homeVolume,
      workspace: names.workspaceVolume,
    });
  } catch (error) {
    emitEvent(deps.db, {
      type: 'container_cleanup_failed',
      investigationId: id,
      payload: {
        container: names.name,
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

async function investigate(
  deps: InvestigationDeps,
  investigation: Investigation,
  signal: AbortSignal,
): Promise<InvestigationOutcome> {
  const { db, runtime, config } = deps;
  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, investigation.projectId))
    .get();
  if (!project) {
    return { status: 'failed', error: `Project ${investigation.projectId} not found` };
  }
  if (investigation.scope === 'ticket') {
    return runOnTicket(deps, {
      investigation,
      project,
      prompt: (where) => investigationPrompt(investigation, project, where),
      signal,
    });
  }
  const names = investigationContainer(investigation.id);
  try {
    await runtime.create({ ...names, image: config.image });
    await runtime.start(names.name);
    await seedCredentials(runtime, names.name, config.credentialsPath);
    if (investigation.scope === 'repository') {
      const token = await projectGitToken(db, project);
      const source = cloneSource(config.gitBaseUrl, project.owner, project.repo, token);
      await cloneInto(runtime, names.name, source, project.config.baseBranch);
    }
    if (signal.aborted) {
      return { status: 'cancelled' };
    }
    const outcome = await (deps.agent ?? runAgent)(runtime, {
      container: names.name,
      cwd: investigation.scope === 'repository' ? REPO_DIR : GLOBAL_DIR,
      model: investigation.model,
      prompt: investigationPrompt(investigation, project),
      tools: investigation.tools,
      signal,
      onEvent: (event) => {
        appendAgentLine(db, { investigationId: investigation.id, payload: event });
      },
    });
    return toOutcome(outcome, signal.aborted);
  } finally {
    await removeContainer(deps, investigation.id);
  }
}

/**
 * Runs queued investigations, each in a throwaway container (`union-i<id>`) removed once it is done,
 * except a ticket's, which runs in the ticket's own container.
 * They share the run slots with the ticket pipeline.
 */
export class InvestigationRunner extends RunPool<Investigation, InvestigationOutcome> {
  /** Tickets asked from investigations are written alongside. */
  private readonly tickets: TicketDrafter;

  constructor(private readonly deps: InvestigationDeps) {
    super({
      slots: deps.slots,
      claim: () => claimInvestigation(deps.db),
      run: (investigation, signal) => investigate(deps, investigation, signal),
      failed: (error) => ({ status: 'failed', error }),
      stopped: { status: 'cancelled' },
      finish: (investigation, outcome) => {
        finishInvestigation(deps.db, investigation.id, outcome);
      },
    });
    this.tickets = new TicketDrafter(deps);
  }

  /** Fails the runs a stopped worker left behind and removes their containers. */
  async recover(): Promise<void> {
    for (const id of failInterruptedInvestigations(this.deps.db)) {
      await removeContainer(this.deps, id);
    }
    await this.tickets.recover();
  }

  override tick(): void {
    super.tick();
    this.tickets.tick();
  }

  override async idle(): Promise<void> {
    await super.idle();
    await this.tickets.idle();
  }
}

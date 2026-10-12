import {
  claimInvestigation,
  emitEvent,
  failInterruptedInvestigations,
  finishInvestigation,
  schema,
  type ContainerRuntime,
  type Db,
  type Investigation,
  type InvestigationOutcome,
  type Project,
} from '@union/core';
import { eq } from 'drizzle-orm';

import { runAgent, type AgentFn, type AgentOutcome } from './agent';
import { projectGitToken } from './credentials';
import {
  cloneInto,
  cloneSource,
  REPO_DIR,
  seedCredentials,
  type ProvisionConfig,
  type TicketContainer,
} from './provision';
import type { RunSlots } from './slots';

/** Where a global investigation runs: the empty workspace volume, no repository. */
const GLOBAL_DIR = '/workspace';

export function investigationContainer(id: number): TicketContainer {
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

/** The user's prompt (after the earlier exchanges, if any), then where the agent stands and what to hand back. */
export function investigationPrompt(investigation: Investigation, project: Project): string {
  const where =
    investigation.scope === 'repository'
      ? `The repository ${project.owner}/${project.repo} is checked out at ${REPO_DIR} on its \`${project.config.baseBranch}\` branch. Read the code to answer; do not change it.`
      : `No repository is checked out: this is a general question for the team working on ${project.owner}/${project.repo}. Answer from your knowledge and the tools you have.`;
  return `${earlierExchanges(investigation)}${investigation.prompt}

---
${where}
Output only your findings as markdown: the answer first, then the evidence (files, links) it rests on.`;
}

export type InvestigationDeps = {
  db: Db;
  runtime: ContainerRuntime;
  config: ProvisionConfig;
  slots: RunSlots;
  agent?: AgentFn;
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

/**
 * Runs queued investigations, each in a throwaway container (`union-i<id>`) removed once it is done.
 * They share the run slots with the ticket pipeline.
 */
export class InvestigationRunner {
  private readonly active = new Map<number, { abort: AbortController; done: Promise<void> }>();

  constructor(private readonly deps: InvestigationDeps) {}

  /** Fails the runs a stopped worker left behind and removes their containers. */
  async recover(): Promise<void> {
    for (const id of failInterruptedInvestigations(this.deps.db)) {
      await this.removeContainer(id);
    }
  }

  tick(): void {
    while (this.deps.slots.tryTake()) {
      const investigation = claimInvestigation(this.deps.db);
      if (!investigation) {
        this.deps.slots.release();
        return;
      }
      const abort = new AbortController();
      const done = this.runTracked(investigation, abort.signal);
      this.active.set(investigation.id, { abort, done });
    }
  }

  /** Stops a running investigation; its run then finishes as cancelled. */
  cancel(id: number): void {
    this.active.get(id)?.abort.abort();
  }

  stop(): void {
    for (const { abort } of this.active.values()) {
      abort.abort();
    }
  }

  async idle(): Promise<void> {
    await Promise.all([...this.active.values()].map((run) => run.done));
  }

  private async runTracked(investigation: Investigation, signal: AbortSignal): Promise<void> {
    try {
      const outcome = await this.run(investigation, signal).catch(
        (error: unknown): InvestigationOutcome => ({
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      finishInvestigation(
        this.deps.db,
        investigation.id,
        signal.aborted ? { status: 'cancelled' } : outcome,
      );
    } finally {
      this.active.delete(investigation.id);
      this.deps.slots.release();
    }
  }

  private async run(
    investigation: Investigation,
    signal: AbortSignal,
  ): Promise<InvestigationOutcome> {
    const { db, runtime, config } = this.deps;
    const project = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, investigation.projectId))
      .get();
    if (!project) {
      return { status: 'failed', error: `Project ${investigation.projectId} not found` };
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
      const outcome = await (this.deps.agent ?? runAgent)(runtime, {
        container: names.name,
        cwd: investigation.scope === 'repository' ? REPO_DIR : GLOBAL_DIR,
        model: investigation.model,
        prompt: investigationPrompt(investigation, project),
        tools: investigation.tools,
        signal,
        onEvent: (event) => {
          emitEvent(db, { type: 'agent_event', investigationId: investigation.id, payload: event });
        },
      });
      return toOutcome(outcome, signal.aborted);
    } finally {
      await this.removeContainer(investigation.id);
    }
  }

  private async removeContainer(id: number): Promise<void> {
    const names = investigationContainer(id);
    try {
      await this.deps.runtime.remove(names.name, {
        home: names.homeVolume,
        workspace: names.workspaceVolume,
      });
    } catch (error) {
      emitEvent(this.deps.db, {
        type: 'container_cleanup_failed',
        investigationId: id,
        payload: {
          container: names.name,
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
}

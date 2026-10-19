// Writes the prompts of the custom agents the user created or regenerated, in a throwaway container with only the Claude login.
import {
  claimCustomAgentPrompt,
  finishCustomAgentPrompt,
  parseWrittenPrompt,
  PROMPT_WRITER_MODEL,
  PROMPT_WRITER_TOOLS,
  promptWriterPrompt,
  requeueCustomAgentPrompts,
  type CustomAgent,
} from '@union/core';

import { runAgent, type AgentFn } from './agent';
import type { TargetDeps } from './agent-review-target';
import { seedCredentials } from './provision';
import type { RunSlots } from './slots';

export type PromptWriterDeps = TargetDeps & { slots: RunSlots; agent?: AgentFn };

type Outcome = { prompt: string } | { error: string };

/** The writer works on text only: its container is empty, its workspace too. */
const WORKSPACE = '/workspace';

function containerFor(agent: CustomAgent): {
  name: string;
  homeVolume: string;
  workspaceVolume: string;
} {
  const name = `union-prompt-writer-${agent.id}`;
  return { name, homeVolume: `${name}-home`, workspaceVolume: `${name}-ws` };
}

async function write(
  deps: PromptWriterDeps,
  agent: CustomAgent,
  signal: AbortSignal,
): Promise<Outcome> {
  const { runtime, config } = deps;
  const container = containerFor(agent);
  const remove = (): Promise<void> =>
    runtime.remove(container.name, {
      home: container.homeVolume,
      workspace: container.workspaceVolume,
    });
  await remove().catch(() => null);
  try {
    await runtime.create({ ...container, image: config.image });
    await runtime.start(container.name);
    await seedCredentials(runtime, container.name, config.credentialsPath);
    const outcome = await (deps.agent ?? runAgent)(runtime, {
      container: container.name,
      cwd: WORKSPACE,
      model: PROMPT_WRITER_MODEL,
      effort: null,
      prompt: promptWriterPrompt(agent),
      tools: [...PROMPT_WRITER_TOOLS],
      signal,
      onEvent: () => {
        // Not logged: the run belongs to no ticket.
      },
    });
    if (outcome.kind !== 'ok') {
      const prefix = outcome.kind === 'rate_limited' ? 'Usage limit reached: ' : '';
      return { error: `${prefix}${outcome.message}` };
    }
    return { prompt: parseWrittenPrompt(outcome.text) };
  } finally {
    await remove();
  }
}

/** Runs queued prompt writer runs, sharing the run slots with the ticket pipeline and the other side runs. */
export class PromptWriterRunner {
  private readonly active = new Map<number, { abort: AbortController; done: Promise<void> }>();

  constructor(private readonly deps: PromptWriterDeps) {}

  /** A run the worker stopped during goes back to the queue: nothing was written yet. */
  recover(): void {
    requeueCustomAgentPrompts(this.deps.db);
  }

  tick(): void {
    while (this.deps.slots.tryTake()) {
      const agent = claimCustomAgentPrompt(this.deps.db);
      if (!agent) {
        this.deps.slots.release();
        return;
      }
      const abort = new AbortController();
      this.active.set(agent.id, { abort, done: this.runTracked(agent, abort.signal) });
    }
  }

  stop(): void {
    for (const { abort } of this.active.values()) {
      abort.abort();
    }
  }

  async idle(): Promise<void> {
    await Promise.all([...this.active.values()].map((run) => run.done));
  }

  private async runTracked(agent: CustomAgent, signal: AbortSignal): Promise<void> {
    try {
      const outcome = await write(this.deps, agent, signal).catch((error: unknown): Outcome => ({
        error: error instanceof Error ? error.message : String(error),
      }));
      finishCustomAgentPrompt(
        this.deps.db,
        agent.id,
        signal.aborted ? { error: 'The worker stopped during the run' } : outcome,
      );
    } finally {
      this.active.delete(agent.id);
      this.deps.slots.release();
    }
  }
}

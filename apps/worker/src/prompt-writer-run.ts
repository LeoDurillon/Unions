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
import { RunPool, WORKER_STOPPED } from './run-pool';
import type { RunSlots } from './slots';
import { inThrowaway } from './throwaway-container';

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

function write(deps: PromptWriterDeps, agent: CustomAgent, signal: AbortSignal): Promise<Outcome> {
  const { runtime } = deps;
  return inThrowaway(deps, containerFor(agent), async (container) => {
    const outcome = await (deps.agent ?? runAgent)(runtime, {
      container,
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
  });
}

/** Runs queued prompt writer runs, sharing the run slots with the ticket pipeline and the other side runs. */
export class PromptWriterRunner extends RunPool<CustomAgent, Outcome> {
  constructor(private readonly deps: PromptWriterDeps) {
    super({
      slots: deps.slots,
      claim: () => claimCustomAgentPrompt(deps.db),
      run: (agent, signal) => write(deps, agent, signal),
      failed: (error) => ({ error }),
      stopped: { error: WORKER_STOPPED },
      finish: (agent, outcome) => {
        finishCustomAgentPrompt(deps.db, agent.id, outcome);
      },
    });
  }

  /** A run the worker stopped during goes back to the queue: nothing was written yet. */
  recover(): void {
    requeueCustomAgentPrompts(this.deps.db);
  }
}

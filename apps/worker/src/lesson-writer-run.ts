// Runs the lesson writer the Memory page asks for, in a throwaway container with only the Claude login.
import {
  claimLessonSuggestion,
  effortFor,
  finishLessonSuggestion,
  lessonWriterPrompt,
  listFeedback,
  listLessons,
  modelFor,
  parseLessonSuggestions,
  recoverLessonSuggestions,
  resolveAgent,
  toolsFor,
  type LessonSuggestion,
  type LessonSuggestionOutcome,
} from '@union/core';

import { runAgent, type AgentFn } from './agent';
import type { TargetDeps } from './agent-review-target';
import { seedCredentials } from './provision';
import { RunPool, WORKER_STOPPED } from './run-pool';
import type { RunSlots } from './slots';

export type LessonWriterDeps = TargetDeps & { slots: RunSlots; agent?: AgentFn };

/** The writer works on text only: its container is empty, its workspace too. */
const WORKSPACE = '/workspace';

function containerFor(row: LessonSuggestion): {
  name: string;
  homeVolume: string;
  workspaceVolume: string;
} {
  const name = `union-lesson-writer-${row.id}`;
  return { name, homeVolume: `${name}-home`, workspaceVolume: `${name}-ws` };
}

function promptFor(deps: LessonWriterDeps, row: LessonSuggestion): string {
  const { db } = deps;
  const feedback = listFeedback(db, row.projectId).filter((item) =>
    row.feedbackIds.includes(item.id),
  );
  if (feedback.length === 0) {
    throw new Error('The feedback asked for is gone');
  }
  return lessonWriterPrompt({
    guidance: resolveAgent(db, 'lesson_writer').prompt,
    feedback,
    lessons: listLessons(db, row.projectId),
  });
}

async function write(
  deps: LessonWriterDeps,
  row: LessonSuggestion,
  signal: AbortSignal,
): Promise<LessonSuggestionOutcome> {
  const { db, runtime, config } = deps;
  const prompt = promptFor(deps, row);
  const container = containerFor(row);
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
      model: modelFor(db, 'lesson_writer'),
      effort: effortFor(db, 'lesson_writer'),
      prompt,
      tools: toolsFor(db, 'lesson_writer'),
      signal,
      onEvent: () => {
        // Not logged: the run belongs to no ticket.
      },
    });
    if (outcome.kind !== 'ok') {
      const prefix = outcome.kind === 'rate_limited' ? 'Usage limit reached: ' : '';
      return { status: 'failed', error: `${prefix}${outcome.message}` };
    }
    return { status: 'ready', suggestions: parseLessonSuggestions(outcome.text) };
  } finally {
    await remove();
  }
}

/** Runs queued lesson writer runs, sharing the run slots with the ticket pipeline and the other side runs. */
export class LessonWriterRunner extends RunPool<LessonSuggestion, LessonSuggestionOutcome> {
  constructor(private readonly deps: LessonWriterDeps) {
    super({
      slots: deps.slots,
      claim: () => claimLessonSuggestion(deps.db),
      run: (row, signal) => write(deps, row, signal),
      failed: (error) => ({ status: 'failed', error }),
      stopped: { status: 'failed', error: WORKER_STOPPED },
      finish: (row, outcome) => {
        finishLessonSuggestion(deps.db, row.id, outcome);
      },
    });
  }

  recover(): void {
    recoverLessonSuggestions(this.deps.db);
  }
}

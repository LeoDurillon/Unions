// The cancel commands of the side runs: the id each one carries, and how a queued or a running one stops.
import {
  cancelQueuedAgentReview,
  cancelQueuedContainerRun,
  cancelQueuedExplanation,
  cancelQueuedGrouping,
  cancelQueuedInvestigation,
  cancelQueuedPrDescription,
  cancelQueuedReport,
  type Db,
} from '@union/core';

import type { CommandHooks } from './commands';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** For each cancel command: the id it carries, the cancel of a queued run, and the stop of a running one. */
const CANCELS: Record<
  string,
  {
    key: string;
    queued: (db: Db, id: number) => boolean;
    running: (hooks: CommandHooks, id: number) => void;
  }
> = {
  cancel_investigation: {
    key: 'investigationId',
    queued: cancelQueuedInvestigation,
    running: (hooks, id) => {
      hooks.cancelInvestigation(id);
    },
  },
  cancel_agent_review: {
    key: 'agentReviewId',
    queued: cancelQueuedAgentReview,
    running: (hooks, id) => {
      hooks.cancelAgentReview(id);
    },
  },
  cancel_review_grouping: {
    key: 'groupingId',
    queued: cancelQueuedGrouping,
    running: (hooks, id) => {
      hooks.cancelReviewGrouping(id);
    },
  },
  cancel_review_explanation: {
    key: 'explanationId',
    queued: cancelQueuedExplanation,
    running: (hooks, id) => {
      hooks.cancelReviewExplanation(id);
    },
  },
  cancel_review_report: {
    key: 'reportId',
    queued: cancelQueuedReport,
    running: (hooks, id) => {
      hooks.cancelReviewReport(id);
    },
  },
  cancel_pr_description: {
    key: 'prDescriptionId',
    queued: cancelQueuedPrDescription,
    running: (hooks, id) => {
      hooks.cancelPrDescription(id);
    },
  },
  cancel_container_run: {
    key: 'containerRunId',
    queued: cancelQueuedContainerRun,
    running: (hooks, id) => {
      hooks.cancelContainerRun(id);
    },
  },
};

export function isCancelCommand(type: string): boolean {
  return Object.hasOwn(CANCELS, type);
}

/** A queued side run is cancelled here; a running one is stopped by its runner. */
export function cancelRun(
  db: Db,
  command: { type: string; payload: unknown },
  hooks: CommandHooks,
): void {
  const cancel = CANCELS[command.type];
  const { payload } = command;
  const id = isRecord(payload) && cancel ? payload[cancel.key] : undefined;
  if (!cancel || typeof id !== 'number') {
    throw new TypeError(`${command.type} needs a numeric "${cancel?.key ?? 'id'}"`);
  }
  if (!cancel.queued(db, id)) {
    cancel.running(hooks, id);
  }
}

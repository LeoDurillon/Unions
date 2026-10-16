// Applies the event rules: queues a delivery for each logged event a rule waits for, then does the due ones, a few per tick and one at a time.
import {
  finishDelivery,
  nextDelivery,
  queueDeliveries,
  type ActionKind,
  type Db,
  type DeliveryOutcome,
  type NotionApi,
} from '@union/core';

import { gitHubCommentTarget, type GitHubApiFor } from './event-actions/github-comment';
import { notionTarget } from './event-actions/notion';
import { deliverAction, type ActionTargets } from './event-actions/target';

/**
 * Queues the deliveries of new events, then does the due ones, oldest first. Each kind of action
 * does at most its target's `perTick` per tick; the first delivery past its kind's limit waits for
 * the next tick.
 */
export class EventDispatcher {
  private running: Promise<void> | null = null;
  private readonly targets: ActionTargets;

  /** Without `apiFor`, GitHub actions fail for want of credentials (tests of Notion actions). */
  constructor(
    private readonly db: Db,
    notion: NotionApi,
    apiFor: GitHubApiFor = () => null,
  ) {
    this.targets = {
      notion_property: notionTarget(db, notion),
      github_comment: gitHubCommentTarget(db, apiFor),
    };
  }

  tick(): void {
    this.running ??= this.workOnce();
  }

  private async workOnce(): Promise<void> {
    try {
      await this.work();
    } finally {
      this.running = null;
    }
  }

  async idle(): Promise<void> {
    await this.running;
  }

  private async work(): Promise<void> {
    queueDeliveries(this.db);
    const done = new Map<ActionKind, number>();
    for (;;) {
      const due = nextDelivery(this.db);
      if (!due) {
        return;
      }
      const { action } = due.rule;
      const count = done.get(action.kind) ?? 0;
      if (count >= this.targets[action.kind].perTick) {
        return;
      }
      done.set(action.kind, count + 1);
      const outcome = await deliverAction(this.targets, due, action).catch(
        (error: unknown): DeliveryOutcome => ({
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      finishDelivery(this.db, due.delivery, outcome);
    }
  }
}

// Follows the event log: writes the notifications and queues a delivery for each event a rule waits
// for. Then it does the due ones, a few per tick and one at a time.
import {
  FetchJiraApi,
  finishDelivery,
  nextDelivery,
  queueDeliveries,
  type Db,
  type DeliveryOutcome,
  type JiraApi,
  type NotionApi,
} from '@union/core';

import { gitHubCommentTarget, type GitHubApiFor } from './event-actions/github-comment';
import { gitHubProjectFieldsTarget } from './event-actions/github-project-fields';
import { gitHubPullRequestTarget } from './event-actions/github-pull-request';
import { deliverAction, paceOf, type ActionTargets } from './event-actions/target';
import { trackerTargets } from './event-actions/tracker';
import { unionNotificationTarget } from './event-actions/union-notification';
import { writeNotifications } from './notifier';

/**
 * Writes the notifications of new events and queues their deliveries, then does the due ones,
 * oldest first. Each kind of action does at most its target's `perTick` per tick; the first
 * delivery past its kind's limit waits for the next tick.
 */
export class EventDispatcher {
  private running: Promise<void> | null = null;
  private readonly targets: ActionTargets;

  /** Without `apiFor`, GitHub actions fail for want of credentials (tests of Notion actions). */
  constructor(
    private readonly db: Db,
    notion: NotionApi,
    apiFor: GitHubApiFor = () => null,
    jira: JiraApi = new FetchJiraApi(),
  ) {
    this.targets = {
      github_comment: gitHubCommentTarget(db, apiFor),
      github_pull_request: gitHubPullRequestTarget(db, apiFor),
      github_project_fields: gitHubProjectFieldsTarget(db, apiFor),
      union_notification: unionNotificationTarget(db),
      ...trackerTargets(db, { notion, jira }),
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
    writeNotifications(this.db);
    queueDeliveries(this.db);
    const done = new Map<string, number>();
    for (;;) {
      const due = nextDelivery(this.db);
      if (!due) {
        return;
      }
      const { action } = due.rule;
      const pace = paceOf(this.targets, action);
      const count = done.get(pace.key) ?? 0;
      if (count >= pace.perTick) {
        return;
      }
      done.set(pace.key, count + 1);
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

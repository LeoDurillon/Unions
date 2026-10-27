// Runs the spec reports the user asked for, on the same run slots as the pipeline and the other review
// agents: a ticket's in its own container, a pull request's in a throwaway one (`union-s<id>`).
import {
  claimReport,
  effortFor,
  failInterruptedReports,
  finishReport,
  modelFor,
  toolsFor,
  type ReportOutcome,
  type ReviewReport,
} from '@union/core';

import type { AgentFn, AgentRun } from './agent';
import type { AgentReviewDeps } from './agent-review';
import { openTarget } from './agent-review-target';
import { withHunkIndex } from './hunk-index-file';
import { removeRunContainers } from './janitor';
import { REPO_DIR, type TicketContainer } from './provision';
import { askReport, reportPrompt } from './review-report-ask';
import { commitMessages, keepInCheckout, lineCounts, reportPaths } from './review-report-checkout';
import { RunPool } from './run-pool';

type Deps = AgentReviewDeps & { agent?: AgentFn };

/** A pull request's report runs in its own throwaway container. */
function reportContainer(id: number): TicketContainer {
  return {
    name: `union-s${id}`,
    homeVolume: `union-s${id}-home`,
    workspaceVolume: `union-s${id}-ws`,
  };
}

async function writeReport(
  deps: Deps,
  report: ReviewReport,
  signal: AbortSignal,
): Promise<ReportOutcome> {
  const { db, runtime } = deps;
  const target = await openTarget(deps, report, reportContainer(report.id));
  return withHunkIndex(runtime, target, async (files) => {
    if (signal.aborted) {
      return { status: 'cancelled' };
    }
    const run: AgentRun = {
      container: target.container,
      cwd: REPO_DIR,
      model: modelFor(db, 'review_report'),
      effort: effortFor(db, 'review_report'),
      prompt: reportPrompt(db, target, report.specs),
      tools: toolsFor(db, 'review_report'),
      signal,
      onEvent: target.log,
    };
    const commits = await commitMessages(runtime, target.container, target.base);
    const sources = { specs: report.specs, files, commits };
    const { outcome, result } = await askReport(deps, run, sources);
    if (outcome.kind !== 'ok') {
      const prefix = outcome.kind === 'rate_limited' ? 'Usage limit reached: ' : '';
      return { status: 'failed', error: `${prefix}${outcome.message}` };
    }
    if (!result) {
      return {
        status: 'failed',
        error: "The agent's answer has no report block",
        raw: outcome.text,
      };
    }
    const counts = await lineCounts(runtime, target.container, reportPaths(result));
    const checked = keepInCheckout(result, counts, new Set(target.paths));
    return { status: 'succeeded', headSha: target.headSha, result: checked };
  });
}

/**
 * Runs the spec reports the user asked for, on the same run slots as the pipeline and the other
 * review agents: a ticket's in its own container, a pull request's in a throwaway one (`union-s<id>`).
 */
export class ReviewReportRunner extends RunPool<ReviewReport, ReportOutcome> {
  constructor(private readonly deps: Deps) {
    super({
      slots: deps.slots,
      claim: () => claimReport(deps.db),
      run: (report, signal) => writeReport(deps, report, signal),
      failed: (error) => ({ status: 'failed', error }),
      stopped: { status: 'cancelled' },
      finish: (report, outcome) => {
        finishReport(deps.db, report.id, outcome);
      },
    });
  }

  /** Fails the reports a stopped worker left running and removes their pull request containers. */
  async recover(): Promise<void> {
    const left = failInterruptedReports(this.deps.db).filter((run) => run.reviewId !== null);
    const containers = left.map((run) => reportContainer(run.id));
    await removeRunContainers(this.deps.db, this.deps.runtime, containers);
  }
}

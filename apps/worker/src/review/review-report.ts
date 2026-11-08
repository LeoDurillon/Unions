// Writes the spec reports the user asked for: a ticket's in its own container, a pull request's in a throwaway one (`union-s<id>`).

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

import { agentFailure, type AgentRun } from '../agent';
import { REPO_DIR } from '../provision';
import type { AgentReviewDeps } from './agent-review';
import { openTarget } from './agent-review-target';
import { SideReviewRunner, STANDARD_ENDS, type SideReviewKind } from './engine';
import { askReport, reportPrompt } from './review-report-ask';
import { commitMessages, keepInCheckout, lineCounts, reportPaths } from './review-report-checkout';

const report: SideReviewKind<ReviewReport, ReportOutcome> = {
  kind: 'report',
  letter: 's',
  claim: ({ db }) => claimReport(db),
  finish: ({ db }, row, outcome) => {
    finishReport(db, row.id, outcome);
  },
  failInterrupted: ({ db }) => failInterruptedReports(db),
  open: openTarget,
  ...STANDARD_ENDS,
  work: async (deps, { row, target, files, signal }) => {
    const { db, runtime } = deps;
    const run: AgentRun = {
      container: target.container,
      cwd: REPO_DIR,
      model: modelFor(db, 'review_report'),
      effort: effortFor(db, 'review_report'),
      prompt: reportPrompt(db, target, row.specs),
      tools: toolsFor(db, 'review_report'),
      signal,
      onEvent: target.log,
    };
    const commits = await commitMessages(runtime, target.container, target.base);
    const { outcome, result } = await askReport(deps, run, { specs: row.specs, files, commits });
    if (outcome.kind !== 'ok') {
      return { status: 'failed', error: agentFailure(outcome) };
    }
    if (!result) {
      // The answer is kept: the report page shows it when its block could not be read.
      return {
        status: 'failed',
        error: "The agent's answer has no report block",
        raw: outcome.text,
      };
    }
    const counts = await lineCounts(runtime, target.container, reportPaths(result));
    const checked = keepInCheckout(result, counts, new Set(target.paths));
    return { status: 'succeeded', headSha: target.headSha, result: checked };
  },
};

/** Runs the spec reports the user asked for, on the run slots the pipeline shares. */
export class ReviewReportRunner extends SideReviewRunner<ReviewReport, ReportOutcome> {
  constructor(deps: AgentReviewDeps) {
    super(deps, report);
  }
}

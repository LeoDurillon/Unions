// Asks the report agent and reads its report, asking once more in the same session when the answer
// has no block.
import type { ContainerRuntime, ReportSpec, ReviewReportResult } from '@union/core';

import { runAgent, type AgentFn, type AgentOutcome, type AgentRun } from './agent';
import { REPORT_AGAIN } from './review-report-prompt';
import { parseReport } from './review-report-result';

export { reportPrompt } from './review-report-prompt';

/**
 * The agent's answer and the report read from it. An answer without the block is asked for it once
 * more; `outcome` stays the first answer then, the one holding the report's text.
 */
export async function askReport(
  deps: { runtime: ContainerRuntime; agent?: AgentFn },
  run: AgentRun,
  specs: ReportSpec[],
  files: { path: string; patch: string }[],
): Promise<{ outcome: AgentOutcome; result: ReviewReportResult | null }> {
  const agent = deps.agent ?? runAgent;
  const read = (answer: string): ReviewReportResult | null => parseReport(answer, specs, files);
  const outcome = await agent(deps.runtime, run);
  const result = outcome.kind === 'ok' ? read(outcome.text) : null;
  if (outcome.kind !== 'ok' || result || run.signal?.aborted) {
    return { outcome, result };
  }
  const again = await agent(deps.runtime, {
    ...run,
    prompt: REPORT_AGAIN,
    resumeSessionId: outcome.sessionId,
  });
  return { outcome, result: again.kind === 'ok' ? read(again.text) : null };
}

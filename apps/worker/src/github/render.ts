import { createHash } from 'node:crypto';

import type { StepOutput, Step } from '@union/core';

const STEP_TITLES: Record<Step, string> = {
  intake: 'Intake',
  summary: 'Summary',
  technical: 'Technical implementation',
  test_plan: 'Test plan',
  implement: 'Implementation',
  final_review: 'Final review',
  rebase: 'Rebase',
};

const VALIDATION_LABELS = {
  pending: 'awaiting review',
  approved: 'approved',
  revise: 'revision requested',
} as const satisfies Record<StepOutput['validation'], string>;

export function stepMarker(ticketId: number, step: Step): string {
  return `<!-- union:ticket=${ticketId} step=${step} -->`;
}

export function ticketMarker(ticketId: number): string {
  return `<!-- union:ticket=${ticketId} -->`;
}

/** Issue body as sent to GitHub: the ticket description plus a marker that identifies our ticket. */
export function renderIssueBody(ticketId: number, body: string): string {
  return `${body}\n\n${ticketMarker(ticketId)}`;
}

/** Inverse of `renderIssueBody`, so title/body comparisons ignore our marker. */
export function stripTicketMarker(body: string): string {
  return body.replace(/\n*<!-- union:ticket=\d+ -->\s*$/u, '');
}

/** `versions` is every version of the step, oldest first; the last one is shown. */
export function renderStepComment(ticketId: number, step: Step, versions: StepOutput[]): string {
  const latest = versions.at(-1);
  if (!latest) {
    throw new Error(`No output for step ${step}`);
  }
  const lines = [
    stepMarker(ticketId, step),
    `### ${STEP_TITLES[step]} · v${latest.version} · ${VALIDATION_LABELS[latest.validation]}`,
    '',
    latest.content,
  ];
  const feedback = versions.filter((version) => version.feedback);
  if (feedback.length > 0) {
    lines.push('', '<details><summary>Revision feedback</summary>', '');
    for (const version of feedback) {
      lines.push(`**v${version.version}:** ${version.feedback}`, '');
    }
    lines.push('</details>');
  }
  return lines.join('\n');
}

export function hashBody(body: string): string {
  return createHash('sha256').update(body).digest('hex');
}

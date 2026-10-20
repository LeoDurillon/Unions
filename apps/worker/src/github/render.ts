import { createHash } from 'node:crypto';

import {
  isCustomStep,
  type BuiltInStep,
  type CustomAgentNames,
  type Step,
  type StepOutput,
} from '@union/core';

const STEP_TITLES: Record<BuiltInStep, string> = {
  intake: 'Intake',
  summary: 'Summary',
  technical: 'Technical implementation',
  test_plan: 'Test plan',
  implement: 'Implementation',
  final_review: 'Final review',
  rebase: 'Rebase',
  simplify: 'Simplify history',
  split_plan: 'Split plan',
  split: 'Split into a stack',
  restack: 'Restack',
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

function commentTitle(step: Step, names: CustomAgentNames): string {
  return isCustomStep(step) ? (names[step] ?? 'Custom agent') : STEP_TITLES[step];
}

/** `versions` is every version of the step, oldest first; the last one is shown. */
export function renderStepComment(
  ticketId: number,
  step: Step,
  versions: StepOutput[],
  names: CustomAgentNames = {},
): string {
  const latest = versions.at(-1);
  if (!latest) {
    throw new Error(`No output for step ${step}`);
  }
  const lines = [
    stepMarker(ticketId, step),
    `### ${commentTitle(step, names)} · v${latest.version} · ${VALIDATION_LABELS[latest.validation]}`,
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

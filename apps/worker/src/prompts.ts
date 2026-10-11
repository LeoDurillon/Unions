import { PLANNING_STEPS, type PlanningStep, type Step, type Ticket } from '@union/core';

export const PLANNING_TOOLS = ['Read', 'Grep', 'Glob'] as const;

export function isPlanningStep(step: Step): step is PlanningStep {
  return PLANNING_STEPS.some((planning) => planning === step);
}

export type PromptInput = {
  ticket: Ticket;
  /** Instructions every agent receives first (editable as the "shared" agent). */
  shared: string;
  /** This step's own instructions (editable per agent). */
  instructions: string;
  /** Approved outputs of earlier steps, in pipeline order. */
  approved: { step: Step; content: string }[];
  revision: { previous: string; feedback: string } | null;
};

export function buildPrompt({
  ticket,
  shared,
  instructions,
  approved,
  revision,
}: PromptInput): string {
  const parts = [shared, `# Task\n\n## ${ticket.title}\n\n${ticket.body}`];
  for (const output of approved) {
    parts.push(`# Approved: ${output.step}\n\n${output.content}`);
  }
  parts.push(`# Your job\n\n${instructions}`);
  if (revision) {
    parts.push(
      `# Revision\n\nYour previous version:\n\n${revision.previous}\n\nUser feedback:\n\n${revision.feedback}\n\nRewrite the section addressing the feedback.`,
    );
  }
  return parts.join('\n\n');
}

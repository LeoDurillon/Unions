import {
  PLANNING_STEPS,
  ticketLabel,
  type PlanningStep,
  type Step,
  type Ticket,
} from '@union/core';

export const PLANNING_TOOLS = ['Read', 'Grep', 'Glob'] as const;

export function isPlanningStep(step: Step): step is PlanningStep {
  return PLANNING_STEPS.some((planning) => planning === step);
}

export type PromptInput = {
  ticket: Ticket;
  /** The done ticket this one builds on: its changes are already in the checkout. */
  parent?: Ticket | null;
  /** Instructions every agent receives first (editable as the "shared" agent). */
  shared: string;
  /** This step's own instructions (editable per agent). */
  instructions: string;
  /** Approved outputs of earlier steps, in pipeline order. */
  approved: { step: Step; content: string }[];
  revision: { previous: string; feedback: string } | null;
};

function parentSection(parent: Ticket): string {
  return `# Builds on\n\nThis ticket builds on ${ticketLabel(parent)} "${parent.title}", which is done. Its changes are already in the code you are working on: build on them, do not redo them.\n\n${parent.body}`;
}

export function buildPrompt({
  ticket,
  parent,
  shared,
  instructions,
  approved,
  revision,
}: PromptInput): string {
  const parts = [shared, `# Task\n\n## ${ticket.title}\n\n${ticket.body}`];
  if (parent) {
    parts.push(parentSection(parent));
  }
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

import {
  CONTAINER_ATTACHMENTS_DIR,
  formatBytes,
  PLANNING_STEPS,
  type Attachment,
  ticketLabel,
  type PlanningStep,
  type Step,
  type Ticket,
} from '@union/core';

export function isPlanningStep(step: Step): step is PlanningStep {
  return PLANNING_STEPS.some((planning) => planning === step);
}

export type PromptInput = {
  ticket: Ticket;
  /** The done ticket this one builds on: its changes are already in the checkout. */
  parent?: Ticket | null;
  /** Instructions every agent receives first: the "shared" agent's, then the project's own. */
  shared: string;
  /** This step's own instructions (editable per agent). */
  instructions: string;
  /** Approved outputs of earlier steps, in pipeline order. */
  approved: { step: Step; content: string }[];
  revision: { previous: string; feedback: string } | null;
  /** The files the user attached to the ticket (none for the rebase, which only replays commits). */
  attachments?: Attachment[];
};

function parentSection(parent: Ticket): string {
  return `# Builds on\n\nThis ticket builds on ${ticketLabel(parent)} "${parent.title}", which is done. Its changes are already in the code you are working on: build on them, do not redo them.\n\n${parent.body}`;
}

function attachmentLine(attachment: Attachment): string {
  const access = attachment.allowInRepo ? 'may be added to the repository' : 'private';
  const note = attachment.note === '' ? '' : `: ${attachment.note}`;
  return `- \`${attachment.name}\` (${formatBytes(attachment.size)}, ${attachment.contentType}, ${access})${note}`;
}

/** The ticket's files, how to use them, and what must never leave the workspace. */
export function attachmentsSection(attachments: Attachment[]): string {
  return `# Attached files

The user attached these files to the ticket. They are in \`${CONTAINER_ATTACHMENTS_DIR}/\`, outside the repository.

${attachments.map((attachment) => attachmentLine(attachment)).join('\n')}

Use them to understand and reproduce what the ticket describes. When you change code, first reproduce the problem with these files, then check the change against the same files, and say in your report how you tested with them (or why you could not).

Files marked "private" must not leave this workspace: do not copy them into the repository or commit them, and do not quote their contents in commits, reports or the pull request description. A push that contains one is refused. Build a minimal test fixture of your own when you need one. Files marked "may be added to the repository" can be used as test fixtures.`;
}

export function buildPrompt({
  ticket,
  parent,
  shared,
  instructions,
  approved,
  revision,
  attachments = [],
}: PromptInput): string {
  const parts = [shared, `# Task\n\n## ${ticket.title}\n\n${ticket.body}`];
  if (parent) {
    parts.push(parentSection(parent));
  }
  if (attachments.length > 0) {
    parts.push(attachmentsSection(attachments));
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

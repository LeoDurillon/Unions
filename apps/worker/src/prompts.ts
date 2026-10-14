import {
  CONTAINER_ATTACHMENTS_DIR,
  formatBytes,
  PLANNING_STEPS,
  type Attachment,
  type Db,
  parentOf,
  schema,
  type ProjectFile,
  ticketLabel,
  type PlanningStep,
  type Step,
  type Ticket,
} from '@union/core';
import { eq } from 'drizzle-orm';

export function isPlanningStep(step: Step): step is PlanningStep {
  return PLANNING_STEPS.some((planning) => planning === step);
}

export type PromptInput = {
  ticket: Ticket;
  /** The done ticket this one builds on: its changes are already in the checkout. */
  parent?: Ticket | null;
  /** The project's base branch, to point at the parent's changes. */
  projectBase?: string;
  /** Instructions every agent receives first: the "shared" agent's, then the project's own. */
  shared: string;
  /** This step's own instructions (editable per agent). */
  instructions: string;
  /** Approved outputs of earlier steps, in pipeline order. */
  approved: { step: Step; content: string }[];
  revision: { previous: string; feedback: string } | null;
  /** The files the user attached to the ticket (none for the rebase, which only replays commits). */
  attachments?: Attachment[];
  /** The files the project puts in every workspace (none for the rebase). */
  projectFiles?: ProjectFile[];
};

/** How to see what the parent changed, from the branches the workspace was cloned with. */
export function parentChanges(parent: Ticket, ticket: Ticket, projectBase: string): string {
  if (parent.branch === null) {
    return '';
  }
  if (ticket.baseBranch === parent.branch) {
    const range = `origin/${parent.baseBranch ?? projectBase}`;
    return `Your branch starts from its branch \`${parent.branch}\`. To see what it changed: \`git log --oneline ${range}..origin/${parent.branch}\` and \`git diff ${range}...origin/${parent.branch}\`.`;
  }
  if (parent.prNumber !== null) {
    const base = ticket.baseBranch ?? projectBase;
    return `It was merged into \`${base}\` through pull request #${parent.prNumber}. To see what it changed, find its commit with \`git log --oneline --grep '#${parent.prNumber}' origin/${base}\`, then \`git show <commit>\`.`;
  }
  return `Its branch was \`${parent.branch}\`: if it is still there, \`git log --oneline origin/${projectBase}..origin/${parent.branch}\` shows what it changed.`;
}

/** The done ticket this one builds on: its text, and where to look at its changes. */
export function parentSection(parent: Ticket, ticket: Ticket, projectBase: string): string {
  const changes = parentChanges(parent, ticket, projectBase);
  return `# Builds on\n\nThis ticket builds on ${ticketLabel(parent)} "${parent.title}", which is done. Its changes are already in the code you are working on: build on them, do not redo them.${changes === '' ? '' : ` ${changes}`}\n\n${parent.body}`;
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

/** The project's files, already in the repository but kept out of git. */
export function projectFilesSection(files: ProjectFile[]): string {
  return `# Project files

The project puts these files in every workspace, at these paths in the repository. Git ignores them (\`.git/info/exclude\`).

${files.map((file) => `- \`${file.path}\` (${formatBytes(file.size)})`).join('\n')}

Use them for the project's local setup (a database dump, a local configuration). Never commit them, copy them elsewhere in the repository, or quote their contents in commits, reports or the pull request description: a push that contains one is refused.`;
}

export function buildPrompt({
  ticket,
  parent,
  projectBase = 'main',
  shared,
  instructions,
  approved,
  revision,
  attachments = [],
  projectFiles = [],
}: PromptInput): string {
  const parts = [shared, `# Task\n\n## ${ticket.title}\n\n${ticket.body}`];
  if (parent) {
    parts.push(parentSection(parent, ticket, projectBase));
  }
  if (attachments.length > 0) {
    parts.push(attachmentsSection(attachments));
  }
  if (projectFiles.length > 0) {
    parts.push(projectFilesSection(projectFiles));
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

/** The ticket's parent and the project's base branch, for the prompt's "Builds on" section. */
export function parentContext(
  db: Db,
  ticket: Ticket,
): { parent: Ticket | null; projectBase: string } {
  const project = db
    .select({ config: schema.projects.config })
    .from(schema.projects)
    .where(eq(schema.projects.id, ticket.projectId))
    .get();
  return { parent: parentOf(db, ticket), projectBase: project?.config.baseBranch ?? 'main' };
}

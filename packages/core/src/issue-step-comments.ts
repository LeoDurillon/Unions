// Reads back the step comments Union wrote on a GitHub issue, to prefill a ticket imported from its pull request.
import { PLANNING_STEPS, type PlanningStep } from './phases';

/** What the user decided on a step's output. */
export type StepValidation = 'pending' | 'approved' | 'revise';

/** A planning step's last output as its comment on the issue shows it. */
export type IssueStepComment = {
  step: PlanningStep;
  version: number;
  validation: StepValidation;
  content: string;
  commentId: string;
};

const MARKER = /^<!-- union:ticket=\d+ step=(?<step>[a-z_0-9]+) -->\n/u;
const HEADING =
  /^### .+ · v(?<version>\d+) · (?<label>approved|awaiting review|revision requested)\n/u;
const FEEDBACK = '\n\n<details><summary>Revision feedback</summary>';
const ANY_TICKET_MARKER = /\n*<!-- union:ticket=\d+ -->[ \t]*/gu;

const VALIDATIONS: Record<string, StepValidation> = {
  approved: 'approved',
  'awaiting review': 'pending',
  'revision requested': 'revise',
};

function planningStep(value: string): PlanningStep | null {
  return PLANNING_STEPS.find((step) => step === value) ?? null;
}

/** The comment's text after its heading, without the folded feedback. */
function contentOf(text: string): string {
  const body = text.replace(/^\n/u, '');
  const feedback = body.lastIndexOf(FEEDBACK);
  return (feedback === -1 ? body : body.slice(0, feedback)).trim();
}

/** The heading's version and validation, and where the content starts; null without one. */
function headingOf(
  rest: string,
): { version: number; validation: StepValidation; end: number } | null {
  const heading = HEADING.exec(rest);
  const label = heading?.groups?.label;
  const validation = label === undefined ? undefined : VALIDATIONS[label];
  if (!heading || !validation) {
    return null;
  }
  return { version: Number(heading.groups?.version), validation, end: heading[0].length };
}

/** One comment's step, or null for a comment Union did not write or a step not prefilled. */
export function parseStepComment(comment: { id: string; body: string }): IssueStepComment | null {
  const body = comment.body.replaceAll('\r\n', '\n');
  const marker = MARKER.exec(body);
  const step = marker?.groups?.step === undefined ? null : planningStep(marker.groups.step);
  if (!marker || !step) {
    return null;
  }
  const rest = body.slice(marker[0].length);
  const heading = headingOf(rest);
  if (!heading) {
    return null;
  }
  const { version, validation, end } = heading;
  return { step, version, validation, content: contentOf(rest.slice(end)), commentId: comment.id };
}

/** The planning steps an issue's comments hold, in pipeline order; a step's last comment wins. */
export function issueStepComments(
  comments: readonly { id: string; body: string }[],
): IssueStepComment[] {
  const found = new Map<PlanningStep, IssueStepComment>();
  for (const comment of comments) {
    const parsed = parseStepComment(comment);
    if (parsed) {
      found.set(parsed.step, parsed);
    }
  }
  return PLANNING_STEPS.flatMap((step) => found.get(step) ?? []);
}

/** The id of the comment Union wrote for `step` on the issue (the last one), if any. */
export function stepCommentId(
  comments: readonly { id: string; body: string }[],
  step: string,
): string | null {
  return (
    comments.findLast((comment) => MARKER.exec(comment.body)?.groups?.step === step)?.id ?? null
  );
}

/** An issue body without the ticket markers Union left in it, wherever they are. */
export function withoutTicketMarkers(body: string): string {
  return body.replaceAll(ANY_TICKET_MARKER, '').trimEnd();
}

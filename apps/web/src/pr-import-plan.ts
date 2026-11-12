// What a pull request becomes on import: its issue, the planning steps read from Union's comments
// there, the flow. Or why it cannot be imported.
import {
  issueStepComments,
  stepCommentId,
  withoutTicketMarkers,
  type IssueStepComment,
} from '@union/core/issue-step-comments';
import type { PipelineStep } from '@union/core/states';

import type { PullRequestSource } from './api-pr-import-types';

type LinkedIssue = PullRequestSource['issues'][number];

export type PullRequestPlan = {
  /** The issue the ticket is on: the first one with Union's comments, else the first linked. */
  issue: LinkedIssue | null;
  steps: IssueStepComment[];
  /** Union's Implementation comment on the issue, edited rather than posted again. */
  implementCommentId: string | null;
  flow: PipelineStep[];
  title: string;
  body: string;
  refusal: string | null;
};

function refusalOf(source: PullRequestSource): string | null {
  if (source.state === 'merged') {
    return `#${source.number} is merged already`;
  }
  if (source.state === 'closed') {
    return `#${source.number} is closed`;
  }
  return source.fromFork
    ? `#${source.number} comes from a fork: Union cannot push to its branch`
    : null;
}

/** The ticket a pull request becomes; the issue's title and description when the ticket is on it. */
export function planPullRequestImport(source: PullRequestSource): PullRequestPlan {
  const read = source.issues.map((issue) => ({ issue, steps: issueStepComments(issue.comments) }));
  const prefilled = read.find(({ steps }) => steps.length > 0);
  const issue = prefilled?.issue ?? source.issues[0] ?? null;
  const steps = prefilled?.steps ?? [];
  return {
    issue,
    steps,
    implementCommentId: issue ? stepCommentId(issue.comments, 'implement') : null,
    flow: [...steps.map(({ step }) => step), 'implement', 'final_review'],
    title: issue?.title ?? source.title,
    body: withoutTicketMarkers(issue?.body ?? source.body),
    refusal: refusalOf(source),
  };
}

// What the pull request import reads from GitHub, and the preview the API answers with.
import type { StepValidation } from '@union/core/issue-step-comments';
import type { PipelineStep, PlanningStep } from '@union/core/states';

/** A pull request read to import as a ticket, with the issues it closes and their comments. */
export type PullRequestSource = {
  number: number;
  title: string;
  body: string;
  url: string;
  state: 'open' | 'closed' | 'merged';
  draft: boolean;
  headBranch: string;
  baseBranch: string;
  headSha: string;
  /** From another repository: the host cannot push to it. */
  fromFork: boolean;
  issues: {
    number: number;
    nodeId: string;
    title: string;
    body: string;
    url: string;
    comments: { id: string; body: string }[];
  }[];
};

/** The pull request import preview: what the ticket would be, or why it cannot be. */
export type PullRequestImport = {
  number: number;
  title: string;
  url: string;
  headBranch: string;
  baseBranch: string;
  draft: boolean;
  /** The issue the ticket would be on, if the pull request closes one. */
  issue: { number: number; title: string; url: string } | null;
  /** The planning steps read from Union's comments on that issue. */
  steps: { step: PlanningStep; version: number; validation: StepValidation }[];
  flow: PipelineStep[];
  /** The ticket already on the pull request or its issue. */
  ticketId: number | null;
  /** Why it cannot be imported (closed, merged, from a fork); null when it can. */
  refusal: string | null;
};

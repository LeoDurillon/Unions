// What each type of event in the log carries, keyed by its `type`: the one place to add an event.
import type { PortForward } from './agent-environment';
import type { ReviewVerdict } from './pr-review-verdicts';
import type { Action, BoardStatus, Phase, Step } from './states';
import type * as tables from './tables';

/** The type of column `K` of `table`, so payloads follow the schema. */
type Column<
  T extends { $inferSelect: object },
  K extends keyof T['$inferSelect'],
> = T['$inferSelect'][K];

type Failure = { error: string };
type Nothing = Record<string, never>;
type PullRequestNumber = { number: Column<typeof tables.tickets, 'prNumber'> };

type TicketPayloads = {
  ticket_created: { title: string };
  ticket_removed: { ticketId: number; title: string };
  ticket_parent_changed: { parentId: number | null };
  ticket_base_chosen: { branch: string | null };
  ticket_flow_chosen: { flow: Column<typeof tables.tickets, 'flow'> };
  ticket_updated_from_github: Nothing;
  phase_changed: { from: Phase; to: Phase; action: Action['type']; board: BoardStatus };
  step_output: { step: Step; version: number };
  start_blocked: { parent: string; parentId: number };
  command_failed: { id: number; type: string; error: string };
  attachment_added: { id: number; name: string };
  attachment_updated: { id: number } & Partial<
    Pick<(typeof tables.ticketAttachments)['$inferSelect'], 'note' | 'allowInRepo'>
  >;
  attachment_removed: { id: number; name: string };
  e2e_screenshots: { count: number };
  diff_updated: { headSha: string; files: number };
};

type RunPayloads = {
  run_started: { step: Step };
  run_finished: { step: Step; status: Column<typeof tables.runs, 'status'> };
  container_stop_failed: Failure;
  container_cleanup_failed: { container: string; error: string };
  agent_ports_forwarded: { forwards: PortForward[]; skipped: string[] };
  agent_ports_failed: Failure;
  agent_services_started: { services: string[] };
  agent_services_stopped: { services: string[] };
  agent_services_failed: Failure;
};

type GitHubPayloads = {
  branch_pushed: { branch: string; rebased?: true; simplified?: true };
  publish_failed: { branch: string; error: string };
  pull_request_opened: { number: number; url: string };
  pull_request_linked: { number: number };
  pull_request_ready: PullRequestNumber;
  pull_request_status: Pick<
    (typeof tables.tickets)['$inferSelect'],
    'prState' | 'prMergedAt' | 'prClosedAt' | 'behindBy'
  >;
  pull_request_merged: PullRequestNumber;
  pull_request_closed: PullRequestNumber;
  pull_request_checks_changed: Pick<
    (typeof tables.tickets)['$inferSelect'],
    'prChecksState' | 'prChecksSha'
  >;
  /** The head commit's checks went red: once each time they turn so on a commit. */
  pull_request_checks_failed: PullRequestNumber & { sha: string };
  /** The user asked GitHub to run a failed Actions job (`jobId`, its check run id) again. */
  ci_job_rerun: { jobId: number; name: string };
  ci_job_rerun_failed: { jobId: number; name: string; error: string };
  github_sync_error: Failure;
  github_issue_created: { issueNumber: number };
  github_status_reverted: { remote: BoardStatus; local: BoardStatus };
  github_dependency_synced: { blockedBy: number | null; removed: number | null };
  chosen_base_missing: { branch: string };
  parent_pull_request_ended: {
    parent: string;
    prNumber: Column<typeof tables.tickets, 'prNumber'>;
    prState: Column<typeof tables.tickets, 'prState'>;
  };
  parent_branch_missing: { parent: string; branch: Column<typeof tables.tickets, 'branch'> };
  /** Logged on the ticket whose pull request it is, if one is; `verdict` is missing on reviews posted before it was kept. */
  pr_review_posted: { reviewId: number; number: number; url: string; verdict?: ReviewVerdict };
  pr_review_failed: { reviewId: number; number: number; error: string };
  pr_description_changed: {
    prDescriptionId: number;
    status: Column<typeof tables.prDescriptions, 'status'>;
    error: string | null;
  };
  pr_description_sent: { prNumber: number };
};

type PreviewPayloads = {
  preview_changed: {
    status: Column<typeof tables.previews, 'status'>;
    url: string | null;
    error: string | null;
  };
  preview_output: { lines: string[] };
  preview_idle_stopped: { minutes: number; message: string };
  preview_busy: { message: string };
};

type ReviewPayloads = {
  review_grouping_changed: {
    groupingId: number;
    reviewId: number | null;
    status: Column<typeof tables.reviewGroupings, 'status'>;
    error: string | null;
  };
  review_explanation_changed: {
    explanationId: number;
    reviewId: number | null;
    status: Column<typeof tables.reviewExplanations, 'status'>;
    error: string | null;
  };
  agent_review_changed: {
    agentReviewId: number;
    reviewId: number | null;
    status: Column<typeof tables.agentReviews, 'status'>;
    comments: Column<typeof tables.agentReviews, 'comments'>;
    error: string | null;
  };
  event_rule_applied: {
    deliveryId: number;
    ruleId: number;
    status: Column<typeof tables.eventDeliveries, 'status'>;
    detail: string | null;
    error: string | null;
  };
};

type InvestigationPayloads = {
  investigation_queued: { title: string } | { rerun: true } | { followUp: number };
  investigation_started: Nothing;
  investigation_finished: { status: 'succeeded' | 'failed' | 'cancelled' };
  investigation_changed_workspace: { ticketId: number };
  investigation_ticket_queued: Nothing;
  investigation_ticket_started: Nothing;
  investigation_ticket_created: { ticketId: number };
  investigation_ticket_failed: Failure;
};

/** Logged without a ticket: the Union settings page follows its custom agents' prompts. */
type CustomAgentPayloads = {
  custom_agent_prompt_ready: { customAgentId: number };
  custom_agent_prompt_failed: { customAgentId: number; error: string };
};

type NotificationPayloads = {
  /** Logged without a ticket or investigation, so it stays out of their logs; the ids are here. */
  notification_created: Pick<
    (typeof tables.notifications)['$inferSelect'],
    'projectId' | 'ticketId' | 'investigationId' | 'kind' | 'title' | 'detail'
  > & { notificationId: number };
};

export type EventPayloads = TicketPayloads &
  RunPayloads &
  GitHubPayloads &
  PreviewPayloads &
  ReviewPayloads &
  InvestigationPayloads &
  CustomAgentPayloads &
  NotificationPayloads;

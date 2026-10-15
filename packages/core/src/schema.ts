import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
  type AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core';

import type { InvestigationExchange, ProjectConfig } from './schema-types';
import type { AgentEffort, AgentModel, BoardStatus, Phase, Step } from './states';

export type {
  InvestigationExchange,
  ProjectConfig,
  ProjectScript,
  PullRequestFile,
} from './schema-types';

export const now = sql`(unixepoch('subsec') * 1000)`;
const timestamps = {
  createdAt: integer('created_at').notNull().default(now),
  updatedAt: integer('updated_at')
    .notNull()
    .default(now)
    .$onUpdate(() => Date.now()),
};

export const projects = sqliteTable(
  'projects',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    owner: text('owner').notNull(),
    repo: text('repo').notNull(),
    /** Empty until the worker resolves `githubProjectUrl`. */
    githubProjectNodeId: text('github_project_node_id').notNull().default(''),
    githubProjectUrl: text('github_project_url'),
    /** Fine-grained or classic PAT (`repo`, `project`). Never sent to the browser. */
    githubToken: text('github_token'),
    /** Installation of the GitHub App (`github_app`) to use instead of a token. */
    githubInstallationId: integer('github_installation_id'),
    /** Notion internal integration secret, for importing tickets. Never sent to the browser. */
    notionToken: text('notion_token'),
    statusFieldId: text('status_field_id'),
    config: text('config', { mode: 'json' }).$type<ProjectConfig>().notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex('projects_repo_idx').on(t.owner, t.repo)],
);

/**
 * The GitHub App projects can authenticate with instead of a token. One row at most (`id` 1): one
 * app can be installed on several accounts, each project picks an installation.
 */
export const githubApp = sqliteTable('github_app', {
  id: integer('id').primaryKey(),
  appId: text('app_id').notNull(),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  /** PEM private key. Never sent to the browser. */
  privateKey: text('private_key').notNull(),
  ...timestamps,
});

export const tickets = sqliteTable(
  'tickets',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    body: text('body').notNull().default(''),
    /** The ticket this one builds on: it cannot start before the parent is done, and branches from it. */
    parentTicketId: integer('parent_ticket_id').references((): AnySQLiteColumn => tickets.id, {
      onDelete: 'set null',
    }),
    issueNumber: integer('issue_number'),
    issueNodeId: text('issue_node_id'),
    projectItemId: text('project_item_id'),
    phase: text('phase', { mode: 'json' }).$type<Phase>().notNull().default({ kind: 'backlog' }),
    branch: text('branch'),
    /** Branch the ticket was cloned from and is compared with (chosen, or the parent's); null: the project's. */
    baseBranch: text('base_branch'),
    /** The branch the user chose to start from, over the parent's and the project's; null: automatic. */
    chosenBaseBranch: text('chosen_base_branch'),
    /** The diff snapshot's head when the user last sent a review: "since last review" starts there. */
    reviewedSha: text('reviewed_sha'),
    prNumber: integer('pr_number'),
    /** The Notion page the ticket was imported from: events update its properties. */
    notionPageId: text('notion_page_id'),
    /** When the draft PR was marked ready for review (set once, after the final approval). */
    prReadyAt: integer('pr_ready_at'),
    /**
     * Commits the base branch has that the PR's branch lacks, polled from GitHub while the PR is open
     * and a rebase could be asked; null otherwise (no PR, closed or merged, not checked yet).
     */
    behindBy: integer('behind_by'),
    /** The pull request's state on GitHub, polled by the worker; null until known (or no PR). */
    prState: text('pr_state', { enum: ['open', 'closed', 'merged'] }),
    /** When GitHub merged the pull request; the board's Merged / Closed column shows it for three weeks. */
    prMergedAt: integer('pr_merged_at'),
    /** When GitHub closed the pull request without merging it; null while it is open or merged. */
    prClosedAt: integer('pr_closed_at'),
    containerName: text('container_name'),
    homeVolume: text('home_volume'),
    workspaceVolume: text('workspace_volume'),
    sessionId: text('session_id'), // current Claude session, resumed between steps
    /** Board column last pushed to (or seen on) the GitHub Project. */
    githubSyncedStatus: text('github_synced_status').$type<BoardStatus>(),
    /** Issue number of the parent last mirrored as "blocked by" on the issue; null: none. */
    githubBlockedBy: integer('github_blocked_by'),
    /** `updatedAt` of the issue when title and body were last reconciled. */
    githubUpdatedAt: text('github_updated_at'),
    ...timestamps,
  },
  (t) => [index('tickets_project_idx').on(t.projectId)],
);

export const runs = sqliteTable('runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ticketId: integer('ticket_id')
    .notNull()
    .references(() => tickets.id, { onDelete: 'cascade' }),
  step: text('step').$type<Step>().notNull(),
  iteration: integer('iteration').notNull().default(1),
  model: text('model').notNull(),
  status: text('status', { enum: ['running', 'succeeded', 'failed', 'rate_limited'] }).notNull(),
  sessionId: text('session_id'),
  costUsd: integer('cost_micro_usd'), // API-equivalent, not billed on Max
  error: text('error'),
  startedAt: integer('started_at').notNull().default(now),
  finishedAt: integer('finished_at'),
});

/** One row per (ticket, step, version); the latest version is what the tab shows. */
export const stepOutputs = sqliteTable(
  'step_outputs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ticketId: integer('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    step: text('step').$type<Step>().notNull(),
    version: integer('version').notNull(),
    content: text('content').notNull(),
    githubCommentId: text('github_comment_id'),
    githubBodyHash: text('github_body_hash'),
    validation: text('validation', { enum: ['pending', 'approved', 'revise'] })
      .notNull()
      .default('pending'),
    feedback: text('feedback'),
    createdAt: integer('created_at').notNull().default(now),
  },
  (t) => [uniqueIndex('step_outputs_idx').on(t.ticketId, t.step, t.version)],
);

/** Append-only log. `seq` is the SSE event id. */
export const events = sqliteTable(
  'events',
  {
    seq: integer('seq').primaryKey({ autoIncrement: true }),
    ticketId: integer('ticket_id'),
    runId: integer('run_id'),
    investigationId: integer('investigation_id'),
    type: text('type').notNull(),
    payload: text('payload', { mode: 'json' }).$type<unknown>().notNull(),
    at: integer('at').notNull().default(now),
  },
  (t) => [
    index('events_ticket_idx').on(t.ticketId, t.seq),
    index('events_investigation_idx').on(t.investigationId, t.seq),
  ],
);

/** UI → worker mailbox. */
export const commands = sqliteTable(
  'commands',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ticketId: integer('ticket_id'),
    type: text('type').notNull(), // start | approve | revise | retry | cancel | create_ticket ...
    payload: text('payload', { mode: 'json' }).$type<unknown>(),
    createdAt: integer('created_at').notNull().default(now),
    handledAt: integer('handled_at'),
    error: text('error'),
  },
  (t) => [index('commands_pending_idx').on(t.handledAt)],
);

export const feedbackEvents = sqliteTable('feedback_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: integer('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  ticketId: integer('ticket_id'),
  section: text('section').notNull(), // agent section the feedback is about
  text: text('text').notNull(),
  curatedAt: integer('curated_at'),
  createdAt: integer('created_at').notNull().default(now),
});

export const lessons = sqliteTable(
  'lessons',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    section: text('section').notNull(),
    rule: text('rule').notNull(),
    position: integer('position').notNull().default(0),
    ...timestamps,
  },
  (t) => [index('lessons_idx').on(t.projectId, t.section)],
);

/** User edits to an agent's prompt, model and tools. No row means the built-in default (see agents.ts). */
export const agentConfigs = sqliteTable('agent_configs', {
  agent: text('agent').primaryKey(), // 'shared' or a planning step
  model: text('model'), // an AgentModel; null for 'shared', which has no model of its own
  /** Thinking effort (`--effort`); null: the CLI's default. Only for agents with a model. */
  effort: text('effort').$type<AgentEffort>(),
  prompt: text('prompt').notNull(),
  /** Allowed tools (`--allowedTools` entries); null: the step's default tools. */
  tools: text('tools', { mode: 'json' }).$type<string[]>(),
  ...timestamps,
});

/** Tools the user added to the list agents pick from, on top of the built-in ones (agent-tools.ts). */
export const agentTools = sqliteTable('agent_tools', {
  /** A Claude Code tool or permission rule: `WebFetch`, `Bash(pnpm *)`, `mcp__server__tool`. */
  name: text('name').primaryKey(),
  description: text('description'),
  createdAt: integer('created_at').notNull().default(now),
});

export const INVESTIGATION_SCOPES = ['global', 'repository', 'ticket'] as const;
export const INVESTIGATION_STATUSES = [
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
] as const;

/**
 * One agent run on a custom prompt, outside the ticket pipeline: nothing is mirrored to GitHub.
 * `repository` runs on a fresh clone of the project's repository, `global` without any code,
 * `ticket` in the ticket's own container (`onTicketId`), on its workspace as the agent left it.
 */
export const investigations = sqliteTable(
  'investigations',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    /** The latest question: the first prompt, or the newest follow-up. */
    prompt: text('prompt').notNull(),
    /** Earlier questions and their answers, oldest first; `prompt` and `result` hold the latest. */
    history: text('history', { mode: 'json' })
      .$type<InvestigationExchange[]>()
      .notNull()
      .default(sql`'[]'`),
    scope: text('scope', { enum: INVESTIGATION_SCOPES }).notNull(),
    /** The ticket a `ticket` investigation runs on (null once that ticket is removed). */
    onTicketId: integer('on_ticket_id').references((): AnySQLiteColumn => tickets.id, {
      onDelete: 'set null',
    }),
    model: text('model').$type<AgentModel>().notNull(),
    tools: text('tools', { mode: 'json' }).$type<string[]>().notNull(),
    status: text('status', { enum: INVESTIGATION_STATUSES }).notNull().default('queued'),
    /** The agent's final answer (markdown). */
    result: text('result'),
    error: text('error'),
    startedAt: integer('started_at'),
    finishedAt: integer('finished_at'),
    /**
     * A ticket asked from the investigation: `queued` until the worker takes it, `running` while an
     * agent writes it, `failed` with `ticketError`; null otherwise. `ticketId` is the last one created.
     */
    ticketStatus: text('ticket_status', { enum: ['queued', 'running', 'failed'] }),
    /** What the user said the ticket should cover, on top of the investigation. */
    ticketContext: text('ticket_context'),
    ticketError: text('ticket_error'),
    ticketId: integer('ticket_id').references((): AnySQLiteColumn => tickets.id, {
      onDelete: 'set null',
    }),
    ...timestamps,
  },
  (t) => [index('investigations_project_idx').on(t.projectId)],
);

/** The branch diff after the latest implementation run; only the newest snapshot per ticket is kept. */
export const diffSnapshots = sqliteTable('diff_snapshots', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ticketId: integer('ticket_id')
    .notNull()
    .references(() => tickets.id, { onDelete: 'cascade' }),
  baseBranch: text('base_branch').notNull(),
  headSha: text('head_sha').notNull(),
  createdAt: integer('created_at').notNull().default(now),
});

export const diffFiles = sqliteTable(
  'diff_files',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    snapshotId: integer('snapshot_id')
      .notNull()
      .references(() => diffSnapshots.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    path: text('path').notNull(),
    oldPath: text('old_path').notNull(),
    status: text('status', { enum: ['added', 'deleted', 'modified', 'renamed'] }).notNull(),
    binary: integer('binary', { mode: 'boolean' }).notNull(),
    additions: integer('additions').notNull(),
    deletions: integer('deletions').notNull(),
    patch: text('patch').notNull(),
  },
  (t) => [index('diff_files_snapshot_idx').on(t.snapshotId, t.position)],
);

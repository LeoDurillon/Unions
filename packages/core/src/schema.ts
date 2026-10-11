import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import type { BoardStatus, Phase, Step } from './states';

const now = sql`(unixepoch('subsec') * 1000)`;
const timestamps = {
  createdAt: integer('created_at').notNull().default(now),
  updatedAt: integer('updated_at')
    .notNull()
    .default(now)
    .$onUpdate(() => Date.now()),
};

export type ProjectConfig = {
  baseBranch: string;
  /** Project Status option names per board column. Defaults: Todo, In Progress, In Review, Done. */
  statusOptions?: Partial<Record<BoardStatus, string>>;
  installCommand?: string;
  gateCommand?: string;
  envFiles?: string[];
  reviewers?: string[];
  maxIterations?: number;
  /** Open a draft PR after the implementation (default true). Off: the user links one by hand. */
  createPullRequest?: boolean;
  /** Hide lock files from the review page (default true). */
  hideLockFiles?: boolean;
  /** Gitignore-style patterns hidden from the review page. */
  reviewIgnore?: string[];
  /** Notion data source tickets can be imported from (with `notionToken`). */
  notionDataSourceId?: string;
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
    /** Notion internal integration secret, for importing tickets. Never sent to the browser. */
    notionToken: text('notion_token'),
    statusFieldId: text('status_field_id'),
    config: text('config', { mode: 'json' }).$type<ProjectConfig>().notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex('projects_repo_idx').on(t.owner, t.repo)],
);

export const tickets = sqliteTable(
  'tickets',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    body: text('body').notNull().default(''),
    issueNumber: integer('issue_number'),
    issueNodeId: text('issue_node_id'),
    projectItemId: text('project_item_id'),
    phase: text('phase', { mode: 'json' }).$type<Phase>().notNull().default({ kind: 'backlog' }),
    branch: text('branch'),
    prNumber: integer('pr_number'),
    /** When the draft PR was marked ready for review (set once, after the final approval). */
    prReadyAt: integer('pr_ready_at'),
    containerName: text('container_name'),
    homeVolume: text('home_volume'),
    workspaceVolume: text('workspace_volume'),
    sessionId: text('session_id'), // current Claude session, resumed between steps
    /** Board column last pushed to (or seen on) the GitHub Project. */
    githubSyncedStatus: text('github_synced_status').$type<BoardStatus>(),
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
    type: text('type').notNull(),
    payload: text('payload', { mode: 'json' }).$type<unknown>().notNull(),
    at: integer('at').notNull().default(now),
  },
  (t) => [index('events_ticket_idx').on(t.ticketId, t.seq)],
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

/** User edits to an agent's prompt and model. No row means the built-in default (see agents.ts). */
export const agentConfigs = sqliteTable('agent_configs', {
  agent: text('agent').primaryKey(), // 'shared' or a planning step
  model: text('model'), // an AgentModel; null for 'shared', which has no model of its own
  prompt: text('prompt').notNull(),
  ...timestamps,
});

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

/** The user's line comments on the diff: drafts until the review is sent. */
export const reviewComments = sqliteTable(
  'review_comments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ticketId: integer('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    side: text('side', { enum: ['old', 'new'] }).notNull(),
    startLine: integer('start_line').notNull(),
    endLine: integer('end_line').notNull(),
    /** The commented lines as they were, so the comment still reads right once the diff changes. */
    excerpt: text('excerpt').notNull(),
    body: text('body').notNull(),
    headSha: text('head_sha').notNull(),
    status: text('status', { enum: ['draft', 'sent'] })
      .notNull()
      .default('draft'),
    sentAt: integer('sent_at'),
    createdAt: integer('created_at').notNull().default(now),
  },
  (t) => [index('review_comments_ticket_idx').on(t.ticketId, t.status)],
);

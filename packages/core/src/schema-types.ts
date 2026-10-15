// Plain types stored in JSON columns, kept apart so schema.ts holds the tables.
import type { DiffStatus } from './diff';
import type { BoardStatus } from './states';

/** A service the proxy serves: at `<id>.localhost` when `prefix` is empty, else `<prefix>.<id>.localhost`. */
export type PreviewService = { name: string; port: number; prefix: string };

/**
 * How a ticket's preview runs: the repository's compose file, the services the proxy serves, and
 * variables given to every service. `env` holds plain values (they reach the browser with the
 * settings) that may use templates (`{service.api.url}`); secret values live in `preview_secrets`.
 */
export type PreviewConfig = {
  /** Path of the compose file in the repository. */
  composeFile: string;
  /**
   * Compose YAML merged over the repository's file (a second `-f`): services and changes Union
   * adds without touching the repository (a database restore, a seed). Kept in the settings, never
   * written to the workspace.
   */
  composeAdditions?: string;
  /** The exposed services; the first is the one "Open" goes to. */
  services?: PreviewService[];
  env: Record<string, string>;
  /**
   * Services started for the agent during the steps that run code (a database for its tests), in
   * the same compose project as the preview; stopped after each step.
   */
  agentServices?: string[];
  /** Compose profiles to enable (`--profile`): services in other profiles are left out. */
  profiles?: string[];
  /** The variables also given as a file, at `path` inside `service`. */
  envFile?: { service: string; path: string };
  /**
   * End-to-end tests run against the preview when the user asks (`npx playwright test`). Unset: no
   * e2e tests.
   */
  e2eCommand?: string;
  /**
   * Minutes without a visit after which a running preview stops (60 when unset; 0: never). Never
   * while the agent runs a step on the ticket or its e2e tests run.
   */
  idleStopMinutes?: number;
  /** At most this many of the project's previews running at once (`UNION_MAX_PREVIEWS` caps all). */
  maxRunning?: number;
  /** Phase 1 settings, read as one exposed service. */
  service?: string;
  port?: number;
};

/** A command saved in the project settings, run in a ticket's workspace from its Preview tab. */
export type ProjectScript = {
  name: string;
  command: string;
  /** Seconds before it is stopped (600 when unset). */
  timeoutSec?: number;
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
  /** Markdown sent to every agent run on this project, after the shared instructions. */
  instructions?: string;
  /** Commands the user runs by name in a ticket's workspace. */
  scripts?: ProjectScript[];
  preview?: PreviewConfig;
};

/** One earlier question of an investigation and the answer it got. */
export type InvestigationExchange = { prompt: string; answer: string };

/** One file of a pull request under review, numbered in the order GitHub lists them. */
export type PullRequestFile = {
  id: number;
  path: string;
  oldPath: string;
  status: DiffStatus;
  binary: boolean;
  additions: number;
  deletions: number;
  /** The file's hunks (no file headers); empty for binary or very large files. */
  patch: string;
};

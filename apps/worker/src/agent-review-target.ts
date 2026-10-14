import {
  emitEvent,
  getTicket,
  schema,
  ticketBase,
  type ContainerRuntime,
  type Db,
} from '@union/core';
import { desc, eq } from 'drizzle-orm';

import { projectGitToken } from './credentials';
import { clonePullRequest } from './pr-checkout';
import {
  cloneSource,
  ensureTicketContainer,
  seedCredentials,
  type ProvisionConfig,
  type TicketContainer,
} from './provision';
import { ensureBranch } from './workspace-git';

export type TargetDeps = { db: Db; runtime: ContainerRuntime; config: ProvisionConfig };

/** The change checked out for the agent, and what its findings are anchored to. */
export type ReviewTarget = {
  container: string;
  projectId: number;
  /** The ref the change is compared with (`git diff <base>...HEAD`). */
  base: string;
  /** The commit the drafts are written on: the diff the user reviews. */
  headSha: string;
  patchOf: (path: string) => string | undefined;
  /** Every changed file's path, as the review page lists them. */
  paths: string[];
  /** What is reviewed, for the prompt. */
  about: string;
  log: (event: unknown) => void;
  close: () => Promise<void>;
};

function loadProject(db: Db, id: number): typeof schema.projects.$inferSelect {
  const project = db.select().from(schema.projects).where(eq(schema.projects.id, id)).get();
  if (!project) {
    throw new Error(`Project ${id} not found`);
  }
  return project;
}

function patches(files: { path: string; patch: string }[]): (path: string) => string | undefined {
  return (path) => files.find((file) => file.path === path)?.patch;
}

/** The ticket's branch in its own container, against the diff the review page shows. */
async function ticketTarget(deps: TargetDeps, ticketId: number): Promise<ReviewTarget> {
  const { db, runtime } = deps;
  const ticket = getTicket(db, ticketId);
  const snapshot = db
    .select()
    .from(schema.diffSnapshots)
    .where(eq(schema.diffSnapshots.ticketId, ticketId))
    .orderBy(desc(schema.diffSnapshots.id))
    .get();
  if (!ticket.branch || !snapshot) {
    throw new Error('No diff to review yet: run the implementation first');
  }
  const project = loadProject(db, ticket.projectId);
  const { name } = await ensureTicketContainer(db, runtime, deps.config, ticket);
  const base = ticketBase(project, ticket);
  await ensureBranch(runtime, name, ticket.branch, base);
  const files = db
    .select()
    .from(schema.diffFiles)
    .where(eq(schema.diffFiles.snapshotId, snapshot.id))
    .all();
  return {
    container: name,
    projectId: project.id,
    base,
    headSha: snapshot.headSha,
    patchOf: patches(files),
    paths: files.map((file) => file.path),
    about: `The ticket's branch \`${ticket.branch}\`. The ticket:\n\n# ${ticket.title}\n\n${ticket.body}`,
    log: (event) => {
      emitEvent(db, { type: 'agent_event', ticketId, payload: event });
    },
    close: async () => {
      // A run the user started meanwhile works in the same container: it stops it itself.
      if (getTicket(db, ticketId).phase.kind !== 'running') {
        await runtime.stop(name);
      }
    },
  };
}

export function agentReviewContainer(id: number): TicketContainer {
  return {
    name: `union-a${id}`,
    homeVolume: `union-a${id}-home`,
    workspaceVolume: `union-a${id}-ws`,
  };
}

/** A throwaway container with the pull request checked out at the commit its files were read at. */
async function pullRequestTarget(
  deps: TargetDeps,
  reviewId: number,
  names: TicketContainer,
): Promise<ReviewTarget> {
  const { db, runtime, config } = deps;
  const review = db
    .select()
    .from(schema.currentReviews)
    .where(eq(schema.currentReviews.id, reviewId))
    .get();
  if (!review?.files || !review.headSha) {
    throw new Error("Open the pull request's review first: its files are not read yet");
  }
  const project = loadProject(db, review.projectId);
  const close = (): Promise<void> =>
    runtime.remove(names.name, { home: names.homeVolume, workspace: names.workspaceVolume });
  try {
    await runtime.create({ ...names, image: config.image });
    await runtime.start(names.name);
    await seedCredentials(runtime, names.name, config.credentialsPath);
    const token = await projectGitToken(db, project);
    const source = cloneSource(config.gitBaseUrl, project.owner, project.repo, token);
    await clonePullRequest(runtime, names.name, source, {
      base: review.baseBranch,
      number: review.prNumber,
      headSha: review.headSha,
    });
  } catch (error) {
    await close();
    throw error;
  }
  return {
    container: names.name,
    projectId: project.id,
    base: `origin/${review.baseBranch}`,
    headSha: review.headSha,
    patchOf: patches(review.files),
    paths: review.files.map((file) => file.path),
    about: `Pull request #${review.prNumber} by ${review.author}, from \`${review.headBranch}\` into \`${review.baseBranch}\`: ${review.title}`,
    log: () => {
      // A pull request review has no log view.
    },
    close,
  };
}

/** A run on a review's change: a ticket's, or a pull request's (`reviewId`), never both. */
export type ReviewRun = { id: number; ticketId: number | null; reviewId: number | null };

/**
 * Checks the change out for the agent: the ticket's branch, or the pull request in a throwaway
 * container named `names` (each kind of run has its own names, ids of different tables collide).
 */
export function openTarget(
  deps: TargetDeps,
  run: ReviewRun,
  names: TicketContainer,
): Promise<ReviewTarget> {
  if (run.ticketId !== null) {
    return ticketTarget(deps, run.ticketId);
  }
  if (run.reviewId === null) {
    throw new Error(`Run ${run.id} has no ticket and no pull request`);
  }
  return pullRequestTarget(deps, run.reviewId, names);
}

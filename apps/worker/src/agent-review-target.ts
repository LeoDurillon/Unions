import {
  appendAgentLine,
  type ContainerRuntime,
  type Db,
  getTicket,
  listSlices,
  schema,
  stackReviewNote,
  ticketBase,
} from '@union/core';
import { desc, eq } from 'drizzle-orm';

import { projectGitToken } from './credentials';
import { clonePullRequest } from './pr-checkout';
import {
  cloneSource,
  ensureTicketContainer,
  seedCredentials,
  type CloneSource,
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
  /** The same without the ticket's text: given specs replace it. */
  brief: string;
  log: (event: unknown) => void;
  close: () => Promise<void>;
};

export function loadProject(db: Db, id: number): typeof schema.projects.$inferSelect {
  const project = db.select().from(schema.projects).where(eq(schema.projects.id, id)).get();
  if (!project) {
    throw new Error(`Project ${id} not found`);
  }
  return project;
}

export function patches(
  files: { path: string; patch: string }[],
): (path: string) => string | undefined {
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
  const stack = stackReviewNote(listSlices(db, ticketId), base);
  return {
    container: name,
    projectId: project.id,
    base,
    headSha: snapshot.headSha,
    patchOf: patches(files),
    paths: files.map((file) => file.path),
    about: `The ticket's branch \`${ticket.branch}\`. The ticket:\n\n# ${ticket.title}\n\n${ticket.body}${stack}`,
    brief: `The ticket's branch \`${ticket.branch}\`, for the ticket "${ticket.title}".${stack}`,
    log: (event) => {
      appendAgentLine(db, { ticketId, payload: event });
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

/**
 * A throwaway container named `names` for the project, with what `clone` checks out in it; the
 * returned `close` removes it. A failure on the way removes it too.
 */
export async function throwawayCheckout(
  deps: TargetDeps,
  project: typeof schema.projects.$inferSelect,
  names: TicketContainer,
  clone: (source: CloneSource) => Promise<void>,
): Promise<() => Promise<void>> {
  const { db, runtime, config } = deps;
  const close = (): Promise<void> =>
    runtime.remove(names.name, { home: names.homeVolume, workspace: names.workspaceVolume });
  try {
    await runtime.create({ ...names, image: config.image });
    await runtime.start(names.name);
    await seedCredentials(runtime, names.name, config.credentialsPath);
    const token = await projectGitToken(db, project);
    await clone(cloneSource(config.gitBaseUrl, project.owner, project.repo, token));
  } catch (error) {
    await close();
    throw error;
  }
  return close;
}

/** A throwaway container with the pull request checked out at the commit its files were read at. */
async function pullRequestTarget(
  deps: TargetDeps,
  reviewId: number,
  names: TicketContainer,
): Promise<ReviewTarget> {
  const { db, runtime } = deps;
  const review = db
    .select()
    .from(schema.currentReviews)
    .where(eq(schema.currentReviews.id, reviewId))
    .get();
  if (!review?.files || !review.headSha) {
    throw new Error("Open the pull request's review first: its files are not read yet");
  }
  const { files, headSha } = review;
  const project = loadProject(db, review.projectId);
  const close = await throwawayCheckout(deps, project, names, (source) =>
    clonePullRequest(runtime, names.name, source, {
      base: review.baseBranch,
      number: review.prNumber,
      headSha,
    }),
  );
  const about = `Pull request #${review.prNumber} by ${review.author}, from \`${review.headBranch}\` into \`${review.baseBranch}\`: ${review.title}`;
  return {
    container: names.name,
    projectId: project.id,
    base: `origin/${review.baseBranch}`,
    headSha,
    patchOf: patches(files),
    paths: files.map((file) => file.path),
    about,
    brief: about,
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

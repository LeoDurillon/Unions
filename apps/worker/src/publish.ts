import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  emitEvent,
  getTicket,
  parentOf,
  schema,
  ticketLabel,
  type ContainerRuntime,
  type Db,
  type Project,
  type Ticket,
} from '@union/core';
import { eq } from 'drizzle-orm';

import { projectGitToken } from './credentials';
import type { GitHubApi } from './github/api';
import { cloneSource, hostGit, type CloneSource, type ProvisionConfig } from './provision';
import { exportBranch } from './workspace-git';

export type PublishResult = {
  pushed: boolean;
  pullRequest: number | null;
  /** True when no PR was opened because the project turned automatic creation off. */
  manualPullRequest: boolean;
  error: string | null;
};

/**
 * Takes the ticket's branch out of the container as a git bundle and pushes it from the host with the
 * project's token or GitHub App installation; the container never sees a credential. With `lease`
 * (the commit the remote branch must still be on) it force-pushes, for a rewritten history: if
 * someone pushed in between, GitHub refuses and nothing is overwritten.
 */
export async function pushBranch(
  runtime: ContainerRuntime,
  container: string,
  remote: { url: string; secret: string | null },
  target: { branch: string; lease?: string },
): Promise<void> {
  const { branch, lease } = target;
  const dir = await mkdtemp(path.join(tmpdir(), 'union-push-'));
  try {
    const bundle = path.join(dir, 'branch.bundle');
    const bare = path.join(dir, 'repo.git');
    await exportBranch(runtime, container, branch, bundle);
    await hostGit(['init', '--quiet', '--bare', bare], null);
    await hostGit(
      ['-C', bare, 'fetch', '--quiet', bundle, `refs/heads/${branch}:refs/heads/${branch}`],
      null,
    );
    const force = lease ? [`--force-with-lease=refs/heads/${branch}:${lease}`] : [];
    await hostGit(
      [
        '-C',
        bare,
        'push',
        '--quiet',
        ...force,
        remote.url,
        `refs/heads/${branch}:refs/heads/${branch}`,
      ],
      remote.secret,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Where the host pushes: the project's repository, with its token or app installation. */
export async function projectRemote(
  db: Db,
  gitBaseUrl: string,
  project: Project,
): Promise<CloneSource> {
  const token = await projectGitToken(db, project);
  return cloneSource(gitBaseUrl, project.owner, project.repo, token);
}

/** `Closes #n`, plus the parent's PR when the branch is stacked on it. */
export function pullRequestBody(db: Db, ticket: Ticket): string {
  const own = ticket.issueNumber === null ? ticket.body : `Closes #${ticket.issueNumber}`;
  const parent = parentOf(db, ticket);
  if (!parent || parent.branch !== ticket.baseBranch) {
    return own;
  }
  const after = parent.prNumber === null ? ticketLabel(parent) : `#${parent.prNumber}`;
  return `${own}\n\nBuilds on ${after}, which it targets: merge that one first.`;
}

async function ensurePullRequest({
  db,
  github,
  project,
  ticket,
  branch,
  base,
}: {
  db: Db;
  github: GitHubApi;
  project: Project;
  ticket: Ticket;
  branch: string;
  base: string;
}): Promise<number> {
  const repo = { owner: project.owner, repo: project.repo };
  const existing = await github.findPullRequest(repo, branch);
  const pull =
    existing ??
    (await github.createPullRequest(repo, {
      title: ticket.title,
      body: pullRequestBody(db, ticket),
      head: branch,
      base,
    }));
  if (!existing) {
    emitEvent(db, { type: 'pull_request_opened', ticketId: ticket.id, payload: pull });
  }
  db.update(schema.tickets)
    .set({ prNumber: pull.number })
    .where(eq(schema.tickets.id, ticket.id))
    .run();
  return pull.number;
}

/** Push, then open the draft PR once. Failures are reported, not thrown: the agent's work stays in the container. */
export async function publishBranch(input: {
  db: Db;
  runtime: ContainerRuntime;
  config: ProvisionConfig;
  github: GitHubApi | null;
  project: Project;
  ticket: Ticket;
  container: string;
  branch: string;
  /** The PR targets this branch: the parent's while it is not merged, else the project's. */
  base: string;
}): Promise<PublishResult> {
  const { db, project, ticket, branch, base } = input;
  try {
    const remote = await projectRemote(db, input.config.gitBaseUrl, project);
    await pushBranch(input.runtime, input.container, remote, { branch });
    emitEvent(db, { type: 'branch_pushed', ticketId: ticket.id, payload: { branch } });
    // Re-read: the user may have linked a PR while the agent was working. A linked PR is kept.
    const { prNumber } = getTicket(db, ticket.id);
    const manualPullRequest = project.config.createPullRequest === false;
    const pullRequest =
      prNumber ??
      (input.github && !manualPullRequest
        ? await ensurePullRequest({ db, github: input.github, project, ticket, branch, base })
        : null);
    return { pushed: true, pullRequest, manualPullRequest, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    emitEvent(db, {
      type: 'publish_failed',
      ticketId: ticket.id,
      payload: { branch, error: message },
    });
    return { pushed: false, pullRequest: null, manualPullRequest: false, error: message };
  }
}

// Puts the ticket's workspace on its branch as GitHub has it, after someone else pushed to it or rewrote it: no push, no agent.
import {
  emitEvent,
  getTicket,
  listSlices,
  recordResync,
  resyncRefusal,
  stepHoldsBranch,
  ticketBase,
  type ContainerRuntime,
  type Db,
} from '@union/core';

import { mustRunIn } from './container-exec';
import { captureDiff } from './diff-snapshot';
import { ensureTicketContainer, REPO_DIR, type ProvisionConfig } from './provision';
import { projectRemote } from './publish';
import { fetchIntoContainer } from './rebase-fetch';
import { contains, headCommit } from './rebase-git';
import { loadProject } from './review';

export type ResyncDeps = { db: Db; runtime: ContainerRuntime; config: ProvisionConfig };

function git(args: string[]): string[] {
  return ['git', '-C', REPO_DIR, ...args];
}

/**
 * Why the reset would lose work: changes not committed, another branch checked out, or commits
 * Union never pushed (neither what it pushed last nor part of the branch on GitHub). Null: none.
 */
async function lostWork(
  runtime: ContainerRuntime,
  container: string,
  moved: { branch: string; pushed: string },
): Promise<string | null> {
  const { branch, pushed } = moved;
  const current = await mustRunIn(runtime, container, git(['branch', '--show-current']));
  if (current.trim() !== branch) {
    return `The workspace is on \`${current.trim() || 'a detached HEAD'}\`, not \`${branch}\`.`;
  }
  const changes = await mustRunIn(runtime, container, git(['status', '--porcelain', '-uno']));
  if (changes.trim() !== '') {
    return `The workspace has changes not committed:\n\n${changes.trim()}`;
  }
  const head = await headCommit(runtime, container);
  if (head === pushed || (await contains(runtime, container, `origin/${branch}`, head))) {
    return null;
  }
  const log = await mustRunIn(runtime, container, git(['log', '--oneline', `${pushed}..HEAD`]));
  return `The workspace has commits Union never pushed, which the resync would drop:\n\n${log.trim()}`;
}

/** Fetches the branch, checks nothing would be lost, resets onto it and captures the diff again. */
async function resync(deps: ResyncDeps, ticketId: number, container: string): Promise<void> {
  const { db, runtime, config } = deps;
  const ticket = getTicket(db, ticketId);
  const { branch, remoteMoved } = ticket;
  if (branch === null || remoteMoved === null) {
    throw new Error('The branch on GitHub is the one Union pushed: nothing to resync');
  }
  const project = loadProject(db, ticket.projectId);
  const base = ticketBase(project, ticket);
  const remote = await projectRemote(db, config.gitBaseUrl, project);
  const head = await fetchIntoContainer(runtime, container, remote, { base, branch });
  const lost = await lostWork(runtime, container, { branch, pushed: remoteMoved.from });
  if (lost) {
    throw new Error(`${lost}\n\nNothing was changed.`);
  }
  if (stepHoldsBranch(getTicket(db, ticketId).phase)) {
    throw new Error('A step started on the branch meanwhile: nothing was changed.');
  }
  await mustRunIn(runtime, container, git(['reset', '--hard', '--quiet', `origin/${branch}`]));
  await captureDiff(db, runtime, { container, ticketId, base });
  recordResync(db, ticketId, { from: remoteMoved.from, to: head });
}

/**
 * Resyncs the ticket's workspace onto its branch on GitHub, in its container (started for it,
 * stopped after unless a step started meanwhile). A refusal or a failure is an event; nothing is
 * pushed and no agent runs.
 */
export async function resyncBranch(deps: ResyncDeps, ticketId: number): Promise<void> {
  const { db, runtime, config } = deps;
  try {
    const ticket = getTicket(db, ticketId);
    const refused = resyncRefusal(ticket, listSlices(db, ticketId).length > 0);
    if (refused) {
      throw new Error(refused);
    }
    const { name } = await ensureTicketContainer(db, runtime, config, ticket);
    try {
      await resync(deps, ticketId, name);
    } finally {
      if (!stepHoldsBranch(getTicket(db, ticketId).phase)) {
        await runtime.stop(name);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    emitEvent(db, { type: 'branch_resync_failed', ticketId, payload: { error: message } });
  }
}

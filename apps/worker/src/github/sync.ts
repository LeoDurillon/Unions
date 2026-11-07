// Mirrors one project's tickets to GitHub: issues and step comments, the GitHub Project's board, pull requests.
import {
  emitEvent,
  getTicket,
  hasGitHubProject,
  mirrorsIssues,
  schema,
  type Db,
} from '@union/core';
import { eq } from 'drizzle-orm';

import type { GitHubApi, RepoRef } from './api';
import { BoardSync } from './board-sync';
import { closeWhenCancelled } from './close-cancelled';
import { pushDependency } from './dependency';
import { IssuePull } from './issue-pull';
import { ensureIssue, pushComments } from './issue-sync';
import { markReadyWhenDone, refreshPullRequest } from './pull-request';

type Project = typeof schema.projects.$inferSelect;

function repoOf(project: Project): RepoRef {
  return { owner: project.owner, repo: project.repo };
}

/**
 * Mirrors tickets to GitHub in layers: the repository (pull requests) always; issues and their step
 * comments when the project mirrors them (a ticket that has an issue keeps it either way); the board
 * only with a GitHub Project connected. GitHub owns title, description and the issue itself; the
 * local DB owns run state. Title and description edits come from the board's items, or from the
 * repository's issues without a board.
 */
export class GitHubSync {
  private readonly lastError = new Map<number, string>();
  private readonly board: BoardSync;
  private readonly issues: IssuePull;

  constructor(
    private readonly db: Db,
    private readonly api: GitHubApi,
    private readonly projectId: number,
  ) {
    this.board = new BoardSync(db, api);
    this.issues = new IssuePull(db, api);
  }

  async push(): Promise<void> {
    const project = this.loadProject();
    if (!project) {
      return;
    }
    const nodeId = await this.boardNodeId(project);
    const tickets = this.ticketsOf(project);
    for (const { id } of tickets) {
      await this.guarded(id, () => this.pushTicket(project, nodeId, id));
    }
  }

  async pull(): Promise<void> {
    try {
      const project = this.loadProject();
      if (project) {
        await this.pullProject(project);
      }
    } catch (error) {
      this.report(0, error);
    }
  }

  private loadProject(): Project | null {
    const row = this.db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, this.projectId))
      .get();
    return row ?? null;
  }

  private ticketsOf(project: Project): (typeof schema.tickets.$inferSelect)[] {
    return this.db
      .select()
      .from(schema.tickets)
      .where(eq(schema.tickets.projectId, project.id))
      .all();
  }

  /** The board's node id; null without a Project, or when it cannot be resolved (reported). */
  private async boardNodeId(project: Project): Promise<string | null> {
    if (!hasGitHubProject(project)) {
      return null;
    }
    try {
      return await this.board.nodeId(project);
    } catch (error) {
      this.report(0, error);
      return null;
    }
  }

  private async guarded(ticketId: number, work: () => Promise<void>): Promise<void> {
    try {
      await work();
      this.lastError.delete(ticketId);
    } catch (error) {
      this.report(ticketId, error);
    }
  }

  /** One event per distinct error, so a long outage does not flood the log. */
  private report(ticketId: number, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    if (this.lastError.get(ticketId) === message) {
      return;
    }
    this.lastError.set(ticketId, message);
    emitEvent(this.db, {
      type: 'github_sync_error',
      ticketId: ticketId === 0 ? undefined : ticketId,
      payload: { error: message },
    });
  }

  private async pushTicket(
    project: Project,
    nodeId: string | null,
    ticketId: number,
  ): Promise<void> {
    const repo = repoOf(project);
    // Cancelled before it had an issue: nothing to open just to close.
    if (mirrorsIssues(project) && getTicket(this.db, ticketId).phase.kind !== 'cancelled') {
      await ensureIssue(this.db, this.api, repo, ticketId);
    }
    if (nodeId !== null) {
      await this.board.push(project, nodeId, ticketId);
    }
    await pushComments(this.db, this.api, repo, ticketId);
    await pushDependency(this.db, this.api, repo, getTicket(this.db, ticketId));
    await markReadyWhenDone(this.db, this.api, repo, getTicket(this.db, ticketId));
    await closeWhenCancelled(this.db, this.api, repo, getTicket(this.db, ticketId));
  }

  private async pullProject(project: Project): Promise<void> {
    const tickets = this.ticketsOf(project);
    const nodeId = await this.boardNodeId(project);
    // The board's items carry the issues' text; without one, the repository's issues do.
    if (nodeId === null) {
      await this.issues.pull(repoOf(project), tickets);
    } else {
      await this.board.pull(project, nodeId, tickets);
    }
    for (const ticket of tickets) {
      await this.guarded(ticket.id, () =>
        refreshPullRequest(this.db, this.api, repoOf(project), ticket),
      );
    }
  }
}

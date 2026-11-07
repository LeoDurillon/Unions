// The GitHub Project part of the sync: the ticket's item on the board, its Status column, and the board's moves read back.
import { boardStatus, getTicket, parseProjectUrl, schema, type Db, type Ticket } from '@union/core';
import { and, eq, isNull } from 'drizzle-orm';

import type { GitHubApi, ProjectInfo } from './api';
import { applyRemoteItem } from './inbound';
import { optionFor } from './status';

type Project = typeof schema.projects.$inferSelect;

/**
 * The board layer of one project's sync, used only while a GitHub Project is connected. A ticket
 * with a pending command keeps its column, so a start requested from the board is not reverted
 * before the worker has applied it.
 */
export class BoardSync {
  private info: ProjectInfo | null = null;

  constructor(
    private readonly db: Db,
    private readonly api: GitHubApi,
  ) {}

  /** The Project's node id; projects created from a URL have none until it is resolved here. */
  async nodeId(project: Project): Promise<string> {
    if (project.githubProjectNodeId !== '') {
      return project.githubProjectNodeId;
    }
    const locator = project.githubProjectUrl ? parseProjectUrl(project.githubProjectUrl) : null;
    if (!locator) {
      throw new Error(`Project ${project.id} has no valid GitHub Project URL`);
    }
    const githubProjectNodeId = await this.api.resolveProject(locator);
    this.db
      .update(schema.projects)
      .set({ githubProjectNodeId })
      .where(eq(schema.projects.id, project.id))
      .run();
    return githubProjectNodeId;
  }

  /** Adds the ticket's issue to the board, then moves its card to the ticket's column. */
  async push(project: Project, nodeId: string, ticketId: number): Promise<void> {
    const ticket = getTicket(this.db, ticketId);
    if (ticket.issueNodeId === null) {
      return;
    }
    if (ticket.projectItemId === null) {
      const projectItemId = await this.api.addToProject(nodeId, ticket.issueNodeId);
      this.db
        .update(schema.tickets)
        .set({ projectItemId })
        .where(eq(schema.tickets.id, ticketId))
        .run();
    }
    await this.pushStatus(project, nodeId, ticketId);
  }

  /** Applies the board's items (title, description, a move to In Progress) to their tickets. */
  async pull(project: Project, nodeId: string, tickets: Ticket[]): Promise<void> {
    const info = await this.projectInfo(project, nodeId);
    const items = await this.api.listProjectItems(nodeId);
    const repoName = `${project.owner}/${project.repo}`.toLowerCase();
    const byNumber = new Map(
      items
        .filter((item) => item.repository.toLowerCase() === repoName)
        .map((item) => [item.issueNumber, item]),
    );
    for (const ticket of tickets) {
      const item = ticket.issueNumber === null ? undefined : byNumber.get(ticket.issueNumber);
      if (item) {
        applyRemoteItem(this.db, project, ticket, { item, info });
      }
    }
  }

  private async projectInfo(project: Project, nodeId: string): Promise<ProjectInfo> {
    if (this.info) {
      return this.info;
    }
    const info = await this.api.getProjectInfo(nodeId);
    this.info = info;
    this.db
      .update(schema.projects)
      .set({ statusFieldId: info.statusFieldId })
      .where(eq(schema.projects.id, project.id))
      .run();
    return info;
  }

  private async pushStatus(project: Project, nodeId: string, ticketId: number): Promise<void> {
    const ticket = getTicket(this.db, ticketId);
    const desired = boardStatus(ticket.phase);
    if (ticket.githubSyncedStatus === desired || ticket.projectItemId === null) {
      return;
    }
    if (this.hasPendingCommand(ticketId)) {
      return;
    }
    const info = await this.projectInfo(project, nodeId);
    const option = optionFor(project.config.statusOptions, desired, info);
    await this.api.setStatus({
      projectNodeId: nodeId,
      itemId: ticket.projectItemId,
      fieldId: info.statusFieldId,
      optionId: option.id,
    });
    this.db
      .update(schema.tickets)
      .set({ githubSyncedStatus: desired })
      .where(eq(schema.tickets.id, ticketId))
      .run();
  }

  private hasPendingCommand(ticketId: number): boolean {
    const pending = this.db
      .select()
      .from(schema.commands)
      .where(and(eq(schema.commands.ticketId, ticketId), isNull(schema.commands.handledAt)))
      .get();
    return pending !== undefined;
  }
}

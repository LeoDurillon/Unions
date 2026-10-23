// Mirrors tickets to GitHub.
import {
  boardStatus,
  emitEvent,
  customAgentNames,
  getTicket,
  parseProjectUrl,
  schema,
  STEPS,
  type Db,
  type Step,
  type StepOutput,
  type Ticket,
} from '@union/core';
import { and, eq, isNull } from 'drizzle-orm';

import type { GitHubApi, ProjectInfo, RepoRef } from './api';
import { pushDependency } from './dependency';
import { applyRemoteItem } from './inbound';
import { markReadyWhenDone, refreshPullRequest } from './pull-request';
import { hashBody, renderIssueBody, renderStepComment, stepMarker } from './render';
import { optionFor } from './status';

type Project = typeof schema.projects.$inferSelect;

function repoOf(project: Project): RepoRef {
  return { owner: project.owner, repo: project.repo };
}

/**
 * Mirrors tickets to GitHub. GitHub owns title, description and the issue itself; the local DB owns
 * run state. A ticket with a pending command is left alone by `push`, so a start requested from the
 * GitHub board is not reverted before the worker has applied it.
 */
export class GitHubSync {
  private readonly infoCache = new Map<number, ProjectInfo>();
  private readonly lastError = new Map<number, string>();

  constructor(
    private readonly db: Db,
    private readonly api: GitHubApi,
    private readonly projectId: number,
  ) {}

  async push(): Promise<void> {
    const project = await this.loadProject();
    if (project) {
      await this.pushProject(project);
    }
  }

  async pull(): Promise<void> {
    try {
      const project = await this.loadProject();
      if (project) {
        await this.pullProject(project);
      }
    } catch (error) {
      this.report(0, error);
    }
  }

  private loadProject(): Promise<Project | null> {
    const row = this.db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, this.projectId))
      .get();
    return row ? this.resolveNodeId(row) : Promise.resolve(null);
  }

  private async pushProject(project: Project): Promise<void> {
    const tickets = this.db
      .select()
      .from(schema.tickets)
      .where(eq(schema.tickets.projectId, project.id))
      .all();
    for (const { id } of tickets) {
      await this.guarded(id, () => this.pushTicket(project, id));
    }
  }

  /** Projects created from a URL have no node id until the first sync resolves it. */
  private async resolveNodeId(project: Project): Promise<Project | null> {
    if (project.githubProjectNodeId !== '') {
      return project;
    }
    const locator = project.githubProjectUrl ? parseProjectUrl(project.githubProjectUrl) : null;
    if (!locator) {
      this.report(0, new Error(`Project ${project.id} has no valid GitHub Project URL`));
      return null;
    }
    try {
      const githubProjectNodeId = await this.api.resolveProject(locator);
      this.db
        .update(schema.projects)
        .set({ githubProjectNodeId })
        .where(eq(schema.projects.id, project.id))
        .run();
      return { ...project, githubProjectNodeId };
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

  private async projectInfo(project: Project): Promise<ProjectInfo> {
    const cached = this.infoCache.get(project.id);
    if (cached) {
      return cached;
    }
    const info = await this.api.getProjectInfo(project.githubProjectNodeId);
    this.infoCache.set(project.id, info);
    this.db
      .update(schema.projects)
      .set({ statusFieldId: info.statusFieldId })
      .where(eq(schema.projects.id, project.id))
      .run();
    return info;
  }

  private async pushTicket(project: Project, ticketId: number): Promise<void> {
    await this.ensureIssue(project, ticketId);
    await this.pushStatus(project, ticketId);
    await this.pushComments(project, ticketId);
    await pushDependency(this.db, this.api, repoOf(project), getTicket(this.db, ticketId));
    await markReadyWhenDone(this.db, this.api, repoOf(project), getTicket(this.db, ticketId));
  }

  private async ensureIssue(project: Project, ticketId: number): Promise<void> {
    const ticket = getTicket(this.db, ticketId);
    let { issueNumber, issueNodeId } = ticket;
    if (issueNumber === null || issueNodeId === null) {
      const issue = await this.api.createIssue(repoOf(project), {
        title: ticket.title,
        body: renderIssueBody(ticket.id, ticket.body),
      });
      ({ number: issueNumber, nodeId: issueNodeId } = issue);
      this.db
        .update(schema.tickets)
        .set({ issueNumber, issueNodeId })
        .where(eq(schema.tickets.id, ticketId))
        .run();
      emitEvent(this.db, { type: 'github_issue_created', ticketId, payload: { issueNumber } });
    }
    if (ticket.projectItemId === null) {
      const projectItemId = await this.api.addToProject(project.githubProjectNodeId, issueNodeId);
      this.db
        .update(schema.tickets)
        .set({ projectItemId })
        .where(eq(schema.tickets.id, ticketId))
        .run();
    }
  }

  private async pushStatus(project: Project, ticketId: number): Promise<void> {
    const ticket = getTicket(this.db, ticketId);
    const desired = boardStatus(ticket.phase);
    if (ticket.githubSyncedStatus === desired || ticket.projectItemId === null) {
      return;
    }
    if (this.hasPendingCommand(ticketId)) {
      return;
    }
    const info = await this.projectInfo(project);
    const option = optionFor(project.config.statusOptions, desired, info);
    await this.api.setStatus({
      projectNodeId: project.githubProjectNodeId,
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

  private async pushComments(project: Project, ticketId: number): Promise<void> {
    const ticket = getTicket(this.db, ticketId);
    if (ticket.issueNumber === null) {
      return;
    }
    const outputs = this.db
      .select()
      .from(schema.stepOutputs)
      .where(eq(schema.stepOutputs.ticketId, ticketId))
      .orderBy(schema.stepOutputs.version)
      .all();
    // The custom steps of its flow too; rebase and simplify have no comment.
    const steps = new Set([...STEPS, ...(ticket.flow ?? [])]);
    for (const step of steps) {
      const versions = outputs.filter((output) => output.step === step);
      if (versions.length > 0) {
        await this.pushStepComment(project, ticket, step, versions);
      }
    }
  }

  private async pushStepComment(
    project: Project,
    ticket: Ticket,
    step: Step,
    versions: StepOutput[],
  ): Promise<void> {
    const latest = versions.at(-1);
    if (!latest || ticket.issueNumber === null) {
      return;
    }
    const body = renderStepComment(ticket.id, step, versions, customAgentNames(this.db));
    const hash = hashBody(body);
    if (latest.githubBodyHash === hash) {
      return;
    }
    const repo = repoOf(project);
    const known = versions.findLast((version) => version.githubCommentId !== null);
    const commentId =
      known?.githubCommentId ?? (await this.findComment(repo, ticket, step)) ?? null;
    const id =
      commentId === null
        ? await this.api.createComment(repo, ticket.issueNumber, body)
        : await this.updateComment(repo, commentId, body);
    this.db
      .update(schema.stepOutputs)
      .set({ githubCommentId: id, githubBodyHash: hash })
      .where(eq(schema.stepOutputs.id, latest.id))
      .run();
  }

  private async updateComment(repo: RepoRef, commentId: string, body: string): Promise<string> {
    await this.api.updateComment(repo, commentId, body);
    return commentId;
  }

  /** Recovers a comment we posted before a DB reset, found by its hidden marker. */
  private async findComment(
    repo: RepoRef,
    ticket: Ticket,
    step: Step,
  ): Promise<string | undefined> {
    if (ticket.issueNumber === null) {
      return undefined;
    }
    const marker = stepMarker(ticket.id, step);
    const comments = await this.api.listComments(repo, ticket.issueNumber);
    return comments.find((comment) => comment.body.includes(marker))?.id;
  }

  private async pullProject(project: Project): Promise<void> {
    const info = await this.projectInfo(project);
    const items = await this.api.listProjectItems(project.githubProjectNodeId);
    const repoName = `${project.owner}/${project.repo}`.toLowerCase();
    const byNumber = new Map(
      items
        .filter((item) => item.repository.toLowerCase() === repoName)
        .map((item) => [item.issueNumber, item]),
    );
    const tickets = this.db
      .select()
      .from(schema.tickets)
      .where(eq(schema.tickets.projectId, project.id))
      .all();
    for (const ticket of tickets) {
      const item = ticket.issueNumber === null ? undefined : byNumber.get(ticket.issueNumber);
      if (item) {
        applyRemoteItem(this.db, project, ticket, { item, info });
      }
      await this.guarded(ticket.id, () =>
        refreshPullRequest(this.db, this.api, repoOf(project), ticket),
      );
    }
  }
}

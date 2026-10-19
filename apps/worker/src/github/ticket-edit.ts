// Writes the title and description the user edited in Union to the ticket's issue, then to the ticket.
import { emitEvent, getTicket, isRecord, schema, type Db, type Project } from '@union/core';
import { eq } from 'drizzle-orm';

import type { GitHubApi, IssueText } from './api';
import { renderIssueBody, stripTicketMarker } from './render';

/** An `edit_ticket` command: the new text, and the text the user started from. */
export type TicketEdit = IssueText & { base: IssueText };

function isText(value: unknown): value is IssueText {
  return isRecord(value) && typeof value.title === 'string' && typeof value.body === 'string';
}

export function ticketEditOf(payload: unknown): TicketEdit {
  const base = isRecord(payload) ? payload.base : undefined;
  if (!isText(payload) || !isText(base)) {
    throw new TypeError('edit_ticket needs "title", "body" and "base"');
  }
  return { title: payload.title, body: payload.body, base: { title: base.title, body: base.body } };
}

function sameText(left: string, right: string): boolean {
  return left.replaceAll('\r\n', '\n').trim() === right.replaceAll('\r\n', '\n').trim();
}

function save(db: Db, ticketId: number, edit: TicketEdit, githubUpdatedAt?: string): void {
  db.update(schema.tickets)
    .set({ title: edit.title, body: edit.body, ...(githubUpdatedAt ? { githubUpdatedAt } : {}) })
    .where(eq(schema.tickets.id, ticketId))
    .run();
  emitEvent(db, { type: 'ticket_edited', ticketId, payload: {} });
}

/**
 * Refused when the issue changed on GitHub since the user opened the edit, so an edit made there is
 * never overwritten unseen. The issue keeps Union's marker only if it had one (an imported issue
 * has none). The new `updatedAt` is kept, so the next pull does not read the edit as GitHub's.
 */
async function writeIssue(
  db: Db,
  api: GitHubApi,
  repo: { owner: string; repo: string },
  input: { ticketId: number; issueNumber: number; edit: TicketEdit },
): Promise<void> {
  const { ticketId, issueNumber, edit } = input;
  const remote = await api.issueText(repo, issueNumber);
  const remoteBody = stripTicketMarker(remote.body);
  if (remote.title !== edit.base.title || !sameText(remoteBody, edit.base.body)) {
    throw new Error('The issue changed on GitHub since you opened the edit: reload and edit again');
  }
  const marked = remoteBody !== remote.body;
  const body = marked ? renderIssueBody(ticketId, edit.body) : edit.body;
  const updatedAt = await api.updateIssue(repo, issueNumber, { title: edit.title, body });
  save(db, ticketId, edit, updatedAt);
}

/** `ticket_edited` or `ticket_edit_failed` on the ticket says how it went. */
export async function editTicket(
  db: Db,
  apiFor: (project: Project) => GitHubApi | null,
  ticketId: number,
  edit: TicketEdit,
): Promise<void> {
  try {
    const ticket = getTicket(db, ticketId);
    if (ticket.issueNumber === null) {
      // No issue yet: the sync creates it with the new text.
      save(db, ticketId, edit);
      return;
    }
    const project = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, ticket.projectId))
      .get();
    const api = project ? apiFor(project) : null;
    if (!project || !api) {
      throw new Error('This project has no GitHub credentials');
    }
    const repo = { owner: project.owner, repo: project.repo };
    await writeIssue(db, api, repo, { ticketId, issueNumber: ticket.issueNumber, edit });
  } catch (error) {
    emitEvent(db, {
      type: 'ticket_edit_failed',
      ticketId,
      payload: { error: error instanceof Error ? error.message : String(error) },
    });
  }
}

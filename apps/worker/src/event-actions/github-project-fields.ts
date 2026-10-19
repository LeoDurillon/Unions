// The GitHub Project fields action of a rule: sets fields of the ticket's issue item, or of its pull request's (added to the Project).
import {
  getTicket,
  projectFieldInput,
  projectFieldsText,
  renderTemplate,
  schema,
  templateValues,
  type Db,
  type DeliveryOutcome,
  type GitHubProjectFieldsAction,
  type Project,
  type ProjectFieldInput,
  type Ticket,
} from '@union/core';
import { eq } from 'drizzle-orm';

import type { GitHubApi } from '../github/api';
import type { GitHubApiFor } from './github-comment';
import { isTemporary } from './github-retry';
import { noTicket, type ActionTarget, type Due } from './target';

/** GitHub limits how fast content changes: one delivery per tick at most. */
const PER_TICK = 1;

type FieldSet = { fieldId: string; name: string; text: string; value: ProjectFieldInput };

type Loaded = { api: GitHubApi; project: Project; ticket: Ticket; projectNodeId: string };

function load(db: Db, apiFor: GitHubApiFor, { delivery, rule }: Due): Loaded | DeliveryOutcome {
  const ticket = delivery.ticketId === null ? null : getTicket(db, delivery.ticketId);
  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, rule.projectId))
    .get();
  if (!ticket || !project) {
    return noTicket(delivery);
  }
  if (project.githubProjectNodeId === '') {
    return { status: 'failed', error: 'The project has no GitHub Project' };
  }
  const api = apiFor(project);
  return api
    ? { api, project, ticket, projectNodeId: project.githubProjectNodeId }
    : { status: 'failed', error: 'The project has no GitHub credentials' };
}

/** What each field is set to, all checked before anything is sent: one wrong fails them all. */
async function fieldSets(
  { api, project, ticket, projectNodeId }: Loaded,
  due: Due,
  action: GitHubProjectFieldsAction,
): Promise<FieldSet[] | string> {
  const fields = await api.projectFields(projectNodeId);
  const values = templateValues(project, ticket, due.event);
  const sets: FieldSet[] = [];
  for (const entry of action.values) {
    const field = fields.find((candidate) => candidate.id === entry.fieldId);
    if (!field) {
      return `${entry.fieldName} is no longer a field of the GitHub Project`;
    }
    const text = renderTemplate(entry.value, values);
    const shaped = projectFieldInput(field, text, field.optionIds);
    if ('error' in shaped) {
      return `${field.name}: ${shaped.error}`;
    }
    sets.push({ fieldId: field.id, name: field.name, text, value: shaped.input });
  }
  return sets;
}

/** The item the fields go on, or why there is none; a pull request is added to the Project. */
async function itemOf(
  { api, project, ticket, projectNodeId }: Loaded,
  action: GitHubProjectFieldsAction,
): Promise<string | DeliveryOutcome> {
  if (action.item === 'issue') {
    return (
      ticket.projectItemId ?? {
        status: 'skipped',
        detail: "The ticket's issue is not on the GitHub Project",
      }
    );
  }
  if (ticket.prNumber === null) {
    return { status: 'skipped', detail: 'The ticket has no pull request' };
  }
  const repo = { owner: project.owner, repo: project.repo };
  return api.addToProject(projectNodeId, await api.pullRequestNodeId(repo, ticket.prNumber));
}

async function setFields(
  loaded: Loaded,
  due: Due,
  action: GitHubProjectFieldsAction,
  done: FieldSet[],
): Promise<DeliveryOutcome> {
  const sets = await fieldSets(loaded, due, action);
  if (typeof sets === 'string') {
    return { status: 'failed', error: sets };
  }
  const item = await itemOf(loaded, action);
  if (typeof item !== 'string') {
    return item;
  }
  for (const set of sets) {
    const change = { projectNodeId: loaded.projectNodeId, itemId: item, fieldId: set.fieldId };
    await loaded.api.setProjectField({ ...change, value: set.value });
    done.push(set);
  }
  const on = action.item === 'issue' ? 'issue' : 'pull request';
  return { status: 'succeeded', detail: `On the ${on}'s item: ${projectFieldsText(sets)}` };
}

async function deliver(
  db: Db,
  apiFor: GitHubApiFor,
  due: Due,
  action: GitHubProjectFieldsAction,
): Promise<DeliveryOutcome> {
  const loaded = load(db, apiFor, due);
  if ('status' in loaded) {
    return loaded;
  }
  const done: FieldSet[] = [];
  try {
    return await setFields(loaded, due, action, done);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const before = done.length > 0 ? `set before: ${projectFieldsText(done)}` : 'nothing set';
    return isTemporary(error)
      ? { status: 'retry', error: message }
      : { status: 'failed', error: message, detail: before };
  }
}

export function gitHubProjectFieldsTarget(
  db: Db,
  apiFor: GitHubApiFor,
): ActionTarget<'github_project_fields'> {
  return { perTick: PER_TICK, deliver: (due, action) => deliver(db, apiFor, due, action) };
}

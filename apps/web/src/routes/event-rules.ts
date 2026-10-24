// `/api/projects/:projectId/event-rules` and its deliveries, and the stored Notion columns.
import {
  checkRule,
  deleteRule,
  EventRuleError,
  getTicket,
  listRules,
  notionAccessOf,
  notionSchemaOf,
  recentDeliveries,
  saveRule,
  schema,
  type Db,
  type NotionApi,
  type Project,
  type RuleInput,
} from '@union/core';
import { eq, inArray } from 'drizzle-orm';
import { Hono, type Context } from 'hono';

import type { DeliveryView, EventRulesResponse } from '../event-api-types';
import { BAD_REQUEST, CONFLICT, CREATED, fail, NOT_FOUND, readObject, requireId } from '../http';
import { previewOf } from '../rule-previews';
import { guarded } from './notion';

function loadProject(db: Db, c: Context): Project {
  const id = requireId(c.req.param('projectId'), 'project id');
  const project = db.select().from(schema.projects).where(eq(schema.projects.id, id)).get();
  if (!project) {
    throw fail(NOT_FOUND, 'Unknown project');
  }
  return project;
}

function ruleInput(body: Record<string, unknown>): RuleInput {
  return {
    name: typeof body.name === 'string' ? body.name : '',
    enabled: body.enabled !== false,
    trigger: body.trigger,
    action: body.action,
  };
}

/** Rule errors are the user's to fix: they answer 400 with the reason. */
function checked<T>(work: () => T): T {
  try {
    return work();
  } catch (error) {
    if (error instanceof EventRuleError) {
      throw fail(BAD_REQUEST, error.message);
    }
    throw error;
  }
}

function list(db: Db, c: Context): Response {
  const project = loadProject(db, c);
  const body: EventRulesResponse = {
    rules: listRules(db, project.id),
    notion: notionSchemaOf(db, project.id),
    hasNotion: notionAccessOf(db, project.id) !== null,
  };
  return c.json(body);
}

function notionAccess(db: Db, projectId: number): { token: string; dataSourceId: string } {
  const access = notionAccessOf(db, projectId);
  if (!access) {
    throw fail(CONFLICT, 'Connect the project to Notion first (Notion settings)');
  }
  return access;
}

function deliveries(db: Db, c: Context): Response {
  const project = loadProject(db, c);
  const rows = recentDeliveries(db, project.id);
  const names = new Map(listRules(db, project.id).map((rule) => [rule.id, rule.name]));
  const ticketIds = rows.flatMap((row) => (row.ticketId === null ? [] : [row.ticketId]));
  const titles = new Map(
    (ticketIds.length === 0
      ? []
      : db.select().from(schema.tickets).where(inArray(schema.tickets.id, ticketIds)).all()
    ).map((ticket) => [ticket.id, ticket.title]),
  );
  const seqs = rows.map((row) => row.eventSeq);
  const types = new Map(
    (seqs.length === 0
      ? []
      : db.select().from(schema.events).where(inArray(schema.events.seq, seqs)).all()
    ).map((event) => [event.seq, event.type]),
  );
  const views: DeliveryView[] = rows.map((row) => ({
    id: row.id,
    ruleId: row.ruleId,
    ruleName: names.get(row.ruleId) ?? '',
    ticketId: row.ticketId,
    ticketTitle: row.ticketId === null ? null : (titles.get(row.ticketId) ?? null),
    eventType: types.get(row.eventSeq) ?? '',
    status: row.status,
    attempts: row.attempts,
    detail: row.detail,
    error: row.error,
    createdAt: row.createdAt,
    finishedAt: row.finishedAt,
  }));
  return c.json(views);
}

/** What the rule as edited would send for one of the project's tickets; nothing is sent. */
async function preview(db: Db, c: Context): Promise<Response> {
  const project = loadProject(db, c);
  const body = await readObject(c.req.raw);
  const ticket = getTicket(db, Number(body.ticketId));
  if (ticket.projectId !== project.id) {
    throw fail(BAD_REQUEST, 'Pick a ticket of this project');
  }
  const rule = checked(() => checkRule(db, project.id, ruleInput(body)));
  return c.json(previewOf(db, project, ticket, rule.action));
}

/** `/api/projects/:projectId/event-rules` and its deliveries, and the stored Notion columns. */
export function eventRuleRoutes(db: Db, notion: NotionApi): Hono {
  const routes = new Hono();
  routes.get('/:projectId/event-rules', (c) => list(db, c));
  routes.post('/:projectId/event-rules', async (c) => {
    const project = loadProject(db, c);
    const input = ruleInput(await readObject(c.req.raw));
    return c.json(
      checked(() => saveRule(db, project.id, input)),
      CREATED,
    );
  });
  routes.put('/:projectId/event-rules/:ruleId', async (c) => {
    const project = loadProject(db, c);
    const ruleId = requireId(c.req.param('ruleId'), 'rule id');
    const input = ruleInput(await readObject(c.req.raw));
    return c.json(checked(() => saveRule(db, project.id, input, ruleId)));
  });
  routes.delete('/:projectId/event-rules/:ruleId', (c) => {
    const project = loadProject(db, c);
    if (!deleteRule(db, project.id, requireId(c.req.param('ruleId'), 'rule id'))) {
      throw fail(NOT_FOUND, 'Rule not found');
    }
    return c.json({ ok: true });
  });
  routes.post('/:projectId/event-rules/preview', (c) => preview(db, c));
  routes.get('/:projectId/event-deliveries', (c) => deliveries(db, c));
  // The people a person property can be set to: read on demand, never stored.
  routes.get('/:projectId/notion/users', async (c) => {
    const { token } = notionAccess(db, loadProject(db, c).id);
    return c.json(await guarded(() => notion.users(token)));
  });
  return routes;
}

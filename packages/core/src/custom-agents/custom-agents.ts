// Custom agents: created and edited by the web, their prompts written by the worker's prompt writer, deleted softly.

import { and, asc, eq, isNull } from 'drizzle-orm';

import type { Db } from '../db';
import type { CustomAgentNames } from '../flow/step-titles';
import * as schema from '../schema/schema';
import { CUSTOM_AGENT_KINDS, type CustomAgentKind } from '../schema/schema-custom-agents';
import { customStep, type CustomStep } from '../states';
import * as tables from '../tables';
import { emitEvent } from '../ticket/tickets';
import { customAgentUsers } from './custom-agent-usage';

export type CustomAgent = typeof tables.customAgents.$inferSelect;
export type { CustomAgentKind } from '../schema/schema-custom-agents';

/** Why a change is refused: the web answers 400, 404 or 409 by `reason`, with the message. */
export class CustomAgentError extends Error {
  constructor(
    message: string,
    readonly reason: 'invalid' | 'not_found' | 'conflict' = 'invalid',
  ) {
    super(message);
  }
}

type Executor = Parameters<typeof emitEvent>[0];

const MAX_AGENT_NAME_CHARS = 40;
const MAX_AGENT_ROLE_CHARS = 2000;

function nameOf(value: string): string {
  const name = value.replaceAll(/\s+/gu, ' ').trim();
  if (name === '' || name.length > MAX_AGENT_NAME_CHARS) {
    throw new CustomAgentError(`A name is 1 to ${MAX_AGENT_NAME_CHARS} characters`);
  }
  return name;
}

function roleOf(value: string): string {
  const role = value.trim();
  if (role === '' || role.length > MAX_AGENT_ROLE_CHARS) {
    throw new CustomAgentError(`A role is 1 to ${MAX_AGENT_ROLE_CHARS} characters`);
  }
  return role;
}

/** Live agents, oldest first; `withDeleted` adds the deleted ones (for names of past runs). */
export function listCustomAgents(db: Db, withDeleted = false): CustomAgent[] {
  return db
    .select()
    .from(tables.customAgents)
    .where(withDeleted ? undefined : isNull(tables.customAgents.deletedAt))
    .orderBy(asc(tables.customAgents.id))
    .all();
}

export function findCustomAgent(db: Db, id: number): CustomAgent | null {
  return db.select().from(tables.customAgents).where(eq(tables.customAgents.id, id)).get() ?? null;
}

function liveAgent(db: Db, id: number): CustomAgent {
  const agent = findCustomAgent(db, id);
  if (!agent || agent.deletedAt !== null) {
    throw new CustomAgentError(`No custom agent ${id}`, 'not_found');
  }
  return agent;
}

function refuseTakenName(db: Db, name: string, except: number | null): void {
  const taken = listCustomAgents(db).some(
    (agent) => agent.id !== except && agent.name.toLowerCase() === name.toLowerCase(),
  );
  if (taken) {
    throw new CustomAgentError(`An agent is already named ${name}`, 'conflict');
  }
}

function update(db: Executor, id: number, values: Partial<CustomAgent>): CustomAgent {
  return db
    .update(tables.customAgents)
    .set(values)
    .where(eq(tables.customAgents.id, id))
    .returning()
    .get();
}

function kindOf(value: string | undefined): CustomAgentKind {
  const kind = CUSTOM_AGENT_KINDS.find((known) => known === (value ?? 'step'));
  if (!kind) {
    throw new CustomAgentError(`An agent's kind is ${CUSTOM_AGENT_KINDS.join(' or ')}`);
  }
  return kind;
}

/** A new agent, queued for the prompt writer; a ticket step unless `kind` says otherwise. */
export function createCustomAgent(
  db: Db,
  input: { name: string; role: string; kind?: string },
): CustomAgent {
  const name = nameOf(input.name);
  const role = roleOf(input.role);
  const kind = kindOf(input.kind);
  refuseTakenName(db, name, null);
  return db.insert(tables.customAgents).values({ name, role, kind }).returning().get();
}

/** Renames the agent or rewrites its role; the prompt stays until the user regenerates it. */
export function editCustomAgent(
  db: Db,
  id: number,
  change: { name?: string; role?: string },
): CustomAgent {
  const agent = liveAgent(db, id);
  const name = change.name === undefined ? undefined : nameOf(change.name);
  if (name !== undefined) {
    refuseTakenName(db, name, id);
  }
  const role = change.role === undefined ? undefined : roleOf(change.role);
  if (name === undefined && role === undefined) {
    return agent;
  }
  return update(db, id, { name: name ?? agent.name, role: role ?? agent.role });
}

/** Queues the prompt writer again; its prompt replaces the default (the user's own edit stays). */
export function regenerateCustomAgent(db: Db, id: number): CustomAgent {
  const agent = liveAgent(db, id);
  if (agent.promptStatus === 'queued' || agent.promptStatus === 'running') {
    throw new CustomAgentError('The prompt is already being written', 'conflict');
  }
  return update(db, id, { promptStatus: 'queued', promptError: null });
}

/** The oldest agent waiting for its prompt, now running; null when none waits. */
export function claimCustomAgentPrompt(db: Db): CustomAgent | null {
  return db.transaction((tx) => {
    const next = tx
      .select()
      .from(tables.customAgents)
      .where(
        and(eq(tables.customAgents.promptStatus, 'queued'), isNull(tables.customAgents.deletedAt)),
      )
      .orderBy(asc(tables.customAgents.id))
      .get();
    return next
      ? tx
          .update(tables.customAgents)
          .set({ promptStatus: 'running' })
          .where(eq(tables.customAgents.id, next.id))
          .returning()
          .get()
      : null;
  });
}

/** Ends the prompt writer's run and logs it, for the settings page to follow. */
export function finishCustomAgentPrompt(
  db: Db,
  id: number,
  outcome: { prompt: string } | { error: string },
): CustomAgent {
  return db.transaction((tx) => {
    if ('prompt' in outcome) {
      emitEvent(tx, { type: 'custom_agent_prompt_ready', payload: { customAgentId: id } });
      return update(tx, id, {
        promptStatus: 'ready',
        defaultPrompt: outcome.prompt,
        promptError: null,
      });
    }
    emitEvent(tx, {
      type: 'custom_agent_prompt_failed',
      payload: { customAgentId: id, error: outcome.error },
    });
    return update(tx, id, { promptStatus: 'failed', promptError: outcome.error });
  });
}

/** A stopped worker's prompt runs go back to the queue; returns how many. */
export function requeueCustomAgentPrompts(db: Db): number {
  return db
    .update(tables.customAgents)
    .set({ promptStatus: 'queued' })
    .where(eq(tables.customAgents.promptStatus, 'running'))
    .returning()
    .all().length;
}

/**
 * Refused while a project's flow, a ticket not yet done or a review run waiting or running uses it; its
 * overrides go with it.
 */
export function deleteCustomAgent(db: Db, id: number): CustomAgent {
  liveAgent(db, id);
  const users = customAgentUsers(db, customStep(id));
  if (users.length > 0) {
    throw new CustomAgentError(`Still used by ${users.join(', ')}`, 'conflict');
  }
  return db.transaction((tx) => {
    tx.delete(schema.agentConfigs)
      .where(eq(schema.agentConfigs.agent, customStep(id)))
      .run();
    return tx
      .update(tables.customAgents)
      .set({ deletedAt: Date.now() })
      .where(eq(tables.customAgents.id, id))
      .returning()
      .get();
  });
}

/** Every custom agent's name by step, deleted ones included. */
export function customAgentNames(db: Db): CustomAgentNames {
  return Object.fromEntries(
    listCustomAgents(db, true).map((agent) => [customStep(agent.id), agent.name]),
  );
}

/** Live agents of `kind` whose prompt was written at least once. */
function readyAgents(db: Db, kind: CustomAgentKind): CustomAgent[] {
  return listCustomAgents(db).filter(
    (agent) => agent.kind === kind && agent.defaultPrompt !== null,
  );
}

/** The steps a flow may name: ready agents of the `step` kind. */
export function flowReadySteps(db: Db): CustomStep[] {
  return readyAgents(db, 'step').map((agent) => customStep(agent.id));
}

/** The agents a review page may run: ready agents of the `review` kind. */
export function readyReviewAgents(db: Db): CustomAgent[] {
  return readyAgents(db, 'review');
}

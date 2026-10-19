// Custom agents: created and edited by the web, their prompts written by the worker's prompt writer, deleted softly.
import { and, asc, eq, isNull } from 'drizzle-orm';

import { customAgentUsers } from './custom-agent-usage';
import type { Db } from './db';
import * as schema from './schema';
import { customStep, type CustomStep } from './states';
import type { CustomAgentNames } from './step-titles';
import * as tables from './tables';

export type CustomAgent = typeof tables.customAgents.$inferSelect;

/** Why a change is refused; the web answers 400 (bad input) or 409 (in use, busy) with the message. */
export class CustomAgentError extends Error {}

export const MAX_AGENT_NAME_CHARS = 40;
export const MAX_AGENT_ROLE_CHARS = 2000;

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
    throw new CustomAgentError(`No custom agent ${id}`);
  }
  return agent;
}

function refuseTakenName(db: Db, name: string, except: number | null): void {
  const taken = listCustomAgents(db).some(
    (agent) => agent.id !== except && agent.name.toLowerCase() === name.toLowerCase(),
  );
  if (taken) {
    throw new CustomAgentError(`An agent is already named ${name}`);
  }
}

function update(db: Db, id: number, values: Partial<CustomAgent>): CustomAgent {
  return db
    .update(tables.customAgents)
    .set(values)
    .where(eq(tables.customAgents.id, id))
    .returning()
    .get();
}

/** A new agent, queued for the prompt writer. */
export function createCustomAgent(db: Db, input: { name: string; role: string }): CustomAgent {
  const name = nameOf(input.name);
  const role = roleOf(input.role);
  refuseTakenName(db, name, null);
  return db.insert(tables.customAgents).values({ name, role }).returning().get();
}

/** Renames the agent or rewrites its role; the prompt stays until the user regenerates it. */
export function editCustomAgent(
  db: Db,
  id: number,
  change: { name?: string; role?: string },
): CustomAgent {
  liveAgent(db, id);
  const name = change.name === undefined ? undefined : nameOf(change.name);
  if (name !== undefined) {
    refuseTakenName(db, name, id);
  }
  const role = change.role === undefined ? undefined : roleOf(change.role);
  return update(db, id, { ...(name ? { name } : {}), ...(role ? { role } : {}) });
}

/** Queues the prompt writer again; its prompt replaces the default (the user's own edit stays). */
export function regenerateCustomAgent(db: Db, id: number): CustomAgent {
  const agent = liveAgent(db, id);
  if (agent.promptStatus === 'queued' || agent.promptStatus === 'running') {
    throw new CustomAgentError('The prompt is already being written');
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

export function finishCustomAgentPrompt(
  db: Db,
  id: number,
  outcome: { prompt: string } | { error: string },
): CustomAgent {
  return update(
    db,
    id,
    'prompt' in outcome
      ? { promptStatus: 'ready', defaultPrompt: outcome.prompt, promptError: null }
      : { promptStatus: 'failed', promptError: outcome.error },
  );
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

/** Refused while a project's flow or a ticket not yet done runs it; its overrides go with it. */
export function deleteCustomAgent(db: Db, id: number): CustomAgent {
  liveAgent(db, id);
  const users = customAgentUsers(db, customStep(id));
  if (users.length > 0) {
    throw new CustomAgentError(`Still used by ${users.join(', ')}`);
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

/** The steps a flow may name: live agents whose prompt was written at least once. */
export function flowReadySteps(db: Db): CustomStep[] {
  return listCustomAgents(db)
    .filter((agent) => agent.defaultPrompt !== null)
    .map((agent) => customStep(agent.id));
}

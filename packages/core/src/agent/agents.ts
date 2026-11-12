// The agents' default prompts, models, efforts and tools, the user's overrides, and how a run resolves them.

import { eq } from 'drizzle-orm';

import { customAgentDefaults, type CustomAgentInfo } from '../custom-agents/custom-agent-config';
import { listCustomAgents } from '../custom-agents/custom-agents';
import type { Db } from '../db';
import * as schema from '../schema/schema';
import {
  customStep,
  isAgentEffort,
  isAgentModel,
  isCustomStep,
  MODEL_BY_STEP,
  PLANNING_STEPS,
  STEPS,
  type AgentEffort,
  type AgentModel,
  type CustomStep,
} from '../states';
import {
  DEFAULT_TOOLS,
  defaultToolsOf,
  validateTools,
  type BuiltInRunAgent,
  type RunAgent,
} from './agent-tools';
import { DEFAULT_PROMPTS } from './default-prompts';

/**
 * `shared` is prepended to every agent's prompt; most others are pipeline steps. `rebase`, `simplify` and `trim` are
 * prompts only: the implementation agent runs them (resumed session, Implementation model).
 */
export const AGENT_IDS = [
  'shared',
  ...PLANNING_STEPS,
  'implement',
  'final_review',
  'review_comments',
  'review_groups',
  'review_explain',
  'review_report',
  'pr_description',
  'pr_replies',
  'rebase',
  'simplify',
  'trim',
  'split_plan',
  'split',
  'lesson_writer',
  'lesson_tidier',
] as const;
export type BuiltInAgentId = (typeof AGENT_IDS)[number];
/** A built-in agent, or a custom agent by its step (`agent_<id>`). */
export type AgentId = BuiltInAgentId | CustomStep;

export type AgentConfig = {
  agent: AgentId;
  /** Null only for `shared`. */
  model: AgentModel | null;
  /** Thinking effort; null: the CLI's default (always for the agents without a model). */
  effort: AgentEffort | null;
  prompt: string;
  defaultModel: AgentModel | null;
  defaultPrompt: string;
  /** Allowed tools; null for the agents that do not run on their own (`shared`, `rebase`, `simplify`, `trim`). */
  tools: string[] | null;
  defaultTools: string[] | null;
  customized: boolean;
  /** Null for a built-in agent. */
  custom: CustomAgentInfo | null;
};

/** A built-in agent's id, or a custom agent's step (whether that agent exists is not checked). */
export function isAgentId(value: string): value is AgentId {
  return isCustomStep(value) || AGENT_IDS.some((agent) => agent === value);
}

const MODEL_BY_AGENT: Record<BuiltInRunAgent, AgentModel> = {
  ...MODEL_BY_STEP,
  review_comments: 'opus',
  review_groups: 'sonnet',
  review_explain: 'haiku',
  // It compares the change with the specs and judges it, unlike the grouping.
  review_report: 'opus',
  pr_description: MODEL_BY_STEP.implement,
  // It resumes the implementer's session, whose cache is the implementer's model's.
  pr_replies: MODEL_BY_STEP.implement,
  lesson_writer: 'haiku',
  // It weighs every lesson against the others, on a click now and then.
  lesson_tidier: 'sonnet',
};
const RUN_AGENTS: readonly BuiltInRunAgent[] = [
  ...STEPS,
  'review_comments',
  'review_groups',
  'review_explain',
  'review_report',
  'pr_description',
  'pr_replies',
  'split_plan',
  'lesson_writer',
  'lesson_tidier',
];

/** Agents with a model of their own: the pipeline steps and the reviewer (not `shared`). */
function stepOf(agent: AgentId): RunAgent | null {
  return isCustomStep(agent) ? agent : (RUN_AGENTS.find((step) => step === agent) ?? null);
}

type Defaults = {
  prompt: string;
  model: AgentModel | null;
  tools: string[] | null;
  custom: CustomAgentInfo | null;
};

function defaultsOf(db: Db, agent: AgentId): Defaults {
  if (isCustomStep(agent)) {
    const custom = customAgentDefaults(db, agent);
    return { ...custom, tools: [...custom.tools] };
  }
  const step = stepOf(agent);
  return {
    prompt: DEFAULT_PROMPTS[agent],
    model: step && !isCustomStep(step) ? MODEL_BY_AGENT[step] : null,
    tools: step ? [...defaultToolsOf(step)] : null,
    custom: null,
  };
}

/** The project's own instructions as a prompt section; empty when it has none. */
export function projectInstructions(project: { config: schema.ProjectConfig }): string {
  const text = project.config.instructions?.trim() ?? '';
  return text === '' ? '' : `# Project instructions\n\n${text}`;
}

/** What every ticket agent gets first: the shared instructions, then the project's own. */
export function sharedPrompt(db: Db, projectId: number): string {
  const shared = resolveAgent(db, 'shared').prompt;
  const project = db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).get();
  const own = project ? projectInstructions(project) : '';
  return own === '' ? shared : `${shared}\n\n${own}`;
}

/** A stored value outside its list (an older free-text entry, a hand edit) reads as the default. */
function storedChoices(row: { model: string | null; effort: string | null } | undefined): {
  model: AgentModel | null;
  effort: AgentEffort | null;
} {
  return {
    model: isAgentModel(row?.model) ? row.model : null,
    effort: isAgentEffort(row?.effort) ? row.effort : null,
  };
}

export function resolveAgent(db: Db, agent: AgentId): AgentConfig {
  const row = db
    .select()
    .from(schema.agentConfigs)
    .where(eq(schema.agentConfigs.agent, agent))
    .get();
  const defaults = defaultsOf(db, agent);
  const stored = storedChoices(row);
  return {
    agent,
    model: defaults.model === null ? null : (stored.model ?? defaults.model),
    effort: defaults.model === null ? null : stored.effort,
    prompt: row?.prompt ?? defaults.prompt,
    defaultModel: defaults.model,
    defaultPrompt: defaults.prompt,
    tools: defaults.tools === null ? null : (row?.tools ?? defaults.tools),
    defaultTools: defaults.tools,
    customized: row !== undefined,
    custom: defaults.custom,
  };
}

/** The built-in agents, then the live custom ones, oldest first. */
export function listAgents(db: Db): AgentConfig[] {
  const custom = listCustomAgents(db).map((agent) => customStep(agent.id));
  return [...AGENT_IDS, ...custom].map((agent) => resolveAgent(db, agent));
}

/** Steps that resume the implementer's session: they keep its model and effort, and add tools to its own. */
const IMPLEMENTER_SESSION = ['rebase', 'retarget', 'simplify', 'split', 'restack'] as const;
type ImplementerSessionStep = (typeof IMPLEMENTER_SESSION)[number];

function inImplementerSession(step: RunAgent): step is ImplementerSessionStep {
  return IMPLEMENTER_SESSION.some((session) => session === step);
}

/** The agent whose settings a run of `step` uses. */
function settingsOf(step: RunAgent): AgentId {
  return inImplementerSession(step) ? 'implement' : step;
}

/** The model a run of `step` uses: the user's choice, else the built-in one. */
export function modelFor(db: Db, step: RunAgent): AgentModel {
  const agent = settingsOf(step);
  return resolveAgent(db, agent).model ?? defaultsOf(db, agent).model ?? MODEL_BY_STEP.implement;
}

/** The thinking effort a run of `step` uses; null: the CLI's default. */
export function effortFor(db: Db, step: RunAgent): AgentEffort | null {
  return resolveAgent(db, settingsOf(step)).effort;
}

/** The tools a run of `step` is allowed: the user's choice, else the step's defaults. */
export function toolsFor(db: Db, step: RunAgent): string[] {
  // The implementer's tools, plus the git commands the step needs.
  if (inImplementerSession(step)) {
    return [...new Set([...toolsFor(db, 'implement'), ...DEFAULT_TOOLS[step]])];
  }
  return resolveAgent(db, step).tools ?? [...defaultToolsOf(step)];
}

/** Saves the agent's edits. Tools left out (or given to an agent without a step) are not stored. */
export function saveAgent(
  db: Db,
  agent: AgentId,
  change: {
    prompt: string;
    model: AgentModel | null;
    effort?: AgentEffort | null;
    tools?: readonly string[] | null;
  },
): AgentConfig {
  const step = stepOf(agent);
  const model = step ? change.model : null;
  const effort = step ? (change.effort ?? null) : null;
  const tools = step && change.tools ? validateTools(db, change.tools, agent) : null;
  db.insert(schema.agentConfigs)
    .values({ agent, model, effort, prompt: change.prompt, tools })
    .onConflictDoUpdate({
      target: schema.agentConfigs.agent,
      set: { model, effort, prompt: change.prompt, tools, updatedAt: Date.now() },
    })
    .run();
  return resolveAgent(db, agent);
}

export function resetAgent(db: Db, agent: AgentId): AgentConfig {
  db.delete(schema.agentConfigs).where(eq(schema.agentConfigs.agent, agent)).run();
  return resolveAgent(db, agent);
}

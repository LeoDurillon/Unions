import { eq } from 'drizzle-orm';

import { DEFAULT_TOOLS, validateTools } from './agent-tools';
import type { Db } from './db';
import * as schema from './schema';
import {
  isAgentModel,
  MODEL_BY_STEP,
  PLANNING_STEPS,
  STEPS,
  type AgentModel,
  type Step,
} from './states';

/**
 * `shared` is prepended to every agent's prompt; most others are pipeline steps. `rebase` is a prompt only: the
 * implementation agent runs it (resumed session, Implementation model).
 */
export const AGENT_IDS = [
  'shared',
  ...PLANNING_STEPS,
  'implement',
  'final_review',
  'rebase',
] as const;
export type AgentId = (typeof AGENT_IDS)[number];

export const DEFAULT_PROMPTS: Record<AgentId, string> = {
  shared: `You are one agent in an automated task pipeline working on a repository.
Follow the repository's own rules (AGENTS.md, CLAUDE.md, README) when they exist.
Output ONLY the markdown requested: no preamble, no closing remarks.`,
  intake: `Rewrite the raw task into a clear engineering task, then ask the technical questions the code cannot answer.
Read the code first: never ask what a file already tells you.

Output exactly two sections:

## Description
Context, goal, acceptance criteria (bullet list), out of scope.

## Technical questions
Numbered questions the user must decide (data model, behaviour, edge cases, scope). Under each question add a line "Answer:" left empty.`,
  summary: `Write the complete task resume: what is built, for whom, acceptance criteria, decisions taken from the user's answers, remaining assumptions.
Output one section starting with "## Summary".`,
  technical: `Propose the technical implementation: packages and files touched, new files, data model changes, API changes, UI components, ordered implementation steps, risks.
Output one section starting with "## Technical implementation".`,
  test_plan: `Write the test plan as a table with columns: ID (T1, T2...), level, file path, scenario, expected result.
One test per distinct state. Cover the acceptance criteria and the edge cases.
Output one section starting with "## Test plan".`,
  implement: `Implement the task as described by the approved summary, technical implementation and test plan.
Work in small steps. Run the project's own checks (tests, lint, typecheck) and fix failures before finishing.
Write the tests listed in the test plan; do not add tests outside it.
Commit your work locally with clear messages. Never push: the host pushes your branch after the checks.
When done, output a short markdown report: what changed (files), how it was verified, anything left open.`,
  final_review: `Review the implementation against the approved summary, technical implementation and test plan.
Read the diff from the base branch. Check correctness, missing acceptance criteria, missing or extra tests, code quality and risky changes.
Do not run the checks: the implementation report states their last result; quote it.
Output a markdown review starting with one line: "VERDICT: APPROVED" or "VERDICT: CHANGES_REQUESTED".
Then list the findings, each with the file, the problem and the suggested fix.`,
  rebase: `Rebase your branch onto the latest base branch (\`origin/<base branch>\`, already fetched for you).
Resolve conflicts keeping the intent of both sides. Run the project's checks and fix anything the rebase broke.
If a conflict cannot be resolved safely, run \`git rebase --abort\` and explain why.
Never push.
Output a short markdown report: the conflicts met and how they were resolved, the checks run and their result.`,
};

export type AgentConfig = {
  agent: AgentId;
  /** Null only for `shared`. */
  model: AgentModel | null;
  prompt: string;
  defaultModel: AgentModel | null;
  defaultPrompt: string;
  /** Allowed tools; null for the agents that do not run on their own (`shared`, `rebase`). */
  tools: string[] | null;
  defaultTools: string[] | null;
  customized: boolean;
};

export function isAgentId(value: string): value is AgentId {
  return AGENT_IDS.some((agent) => agent === value);
}

/** Agents with a model of their own: the pipeline steps (not `shared`, not `rebase`). */
function stepOf(agent: AgentId): Step | null {
  return STEPS.find((step) => step === agent) ?? null;
}

function defaultModel(agent: AgentId): AgentModel | null {
  const step = stepOf(agent);
  return step ? MODEL_BY_STEP[step] : null;
}

function defaultTools(agent: AgentId): string[] | null {
  const step = stepOf(agent);
  return step ? [...DEFAULT_TOOLS[step]] : null;
}

export function resolveAgent(db: Db, agent: AgentId): AgentConfig {
  const row = db
    .select()
    .from(schema.agentConfigs)
    .where(eq(schema.agentConfigs.agent, agent))
    .get();
  const fallbackModel = defaultModel(agent);
  // A stored value outside the list (an older free-text entry) falls back to the default.
  const storedModel = isAgentModel(row?.model) ? row.model : null;
  const fallbackTools = defaultTools(agent);
  return {
    agent,
    model: fallbackModel === null ? null : (storedModel ?? fallbackModel),
    prompt: row?.prompt ?? DEFAULT_PROMPTS[agent],
    defaultModel: fallbackModel,
    defaultPrompt: DEFAULT_PROMPTS[agent],
    tools: fallbackTools === null ? null : (row?.tools ?? fallbackTools),
    defaultTools: fallbackTools,
    customized: row !== undefined,
  };
}

export function listAgents(db: Db): AgentConfig[] {
  return AGENT_IDS.map((agent) => resolveAgent(db, agent));
}

/** The model a run of `step` uses: the user's choice, else the built-in one. */
export function modelFor(db: Db, step: Step): AgentModel {
  return resolveAgent(db, step).model ?? MODEL_BY_STEP[step];
}

/** The tools a run of `step` is allowed: the user's choice, else the step's defaults. */
export function toolsFor(db: Db, step: Step): string[] {
  return resolveAgent(db, step).tools ?? [...DEFAULT_TOOLS[step]];
}

/** Saves the agent's edits. Tools left out (or given to an agent without a step) are not stored. */
export function saveAgent(
  db: Db,
  agent: AgentId,
  change: { prompt: string; model: AgentModel | null; tools?: readonly string[] | null },
): AgentConfig {
  const step = stepOf(agent);
  const model = step ? change.model : null;
  const tools = step && change.tools ? validateTools(db, change.tools) : null;
  db.insert(schema.agentConfigs)
    .values({ agent, model, prompt: change.prompt, tools })
    .onConflictDoUpdate({
      target: schema.agentConfigs.agent,
      set: { model, prompt: change.prompt, tools, updatedAt: Date.now() },
    })
    .run();
  return resolveAgent(db, agent);
}

export function resetAgent(db: Db, agent: AgentId): AgentConfig {
  db.delete(schema.agentConfigs).where(eq(schema.agentConfigs.agent, agent)).run();
  return resolveAgent(db, agent);
}

// The agents' default prompts, models, efforts and tools, the user's overrides, and how a run resolves them.
import { eq } from 'drizzle-orm';

import { DEFAULT_TOOLS, validateTools, type RunAgent } from './agent-tools';
import type { Db } from './db';
import { LESSON_WRITER_PROMPT } from './lesson-writer';
import * as schema from './schema';
import {
  isAgentEffort,
  isAgentModel,
  MODEL_BY_STEP,
  PLANNING_STEPS,
  STEPS,
  type AgentEffort,
  type AgentModel,
} from './states';

/**
 * `shared` is prepended to every agent's prompt; most others are pipeline steps. `rebase` and `simplify` are
 * prompts only: the implementation agent runs them (resumed session, Implementation model).
 */
export const AGENT_IDS = [
  'shared',
  ...PLANNING_STEPS,
  'implement',
  'final_review',
  'review_comments',
  'review_groups',
  'pr_description',
  'rebase',
  'simplify',
  'lesson_writer',
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
  test_plan: `Write the smallest test plan that would catch a wrong implementation of this task.
Plan a test only if it fails when an acceptance criterion or a decision in the summary is broken,
or when a risk named in the technical implementation happens. For each test ask: would a real bug
get through without it? If not, drop it.
Do not plan:
- tests of private helpers whose behaviour is already tested through the public code using them;
- one test per input variant when one case proves the rule: merge them into one row;
- tests that only check mocks are called in some order, unless that order is the requirement;
- "existing tests still pass" rows: the checks run anyway;
- trivial cases (empty input, defaults) unless the task changes them.
Test at the level the project already tests this behaviour. No e2e test unless the summary asks for one.
Aim for 5 to 15 tests; a plan above 15 explains why in one line under the table.
Columns: ID (T1, T2...), level, file path, scenario, expected result, guards (the criterion or risk it protects).
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
  review_comments: `Review the change as a careful senior reviewer and leave line comments on it, as a person reviewing a pull request would.
Read the diff from the base branch, and the surrounding code wherever a change depends on it.
Comment only on what matters: bugs, wrong behaviour, missing edge cases, security, data loss, races, misleading names, risky changes without tests.
No praise, no summary of the change, no style remarks a formatter or linter would catch. At most 15 comments: fewer, sharper comments are better.
Each comment says what is wrong and suggests the fix, in a few sentences.`,
  review_groups: `Group the change's files by the parts of the specification they implement, so a reviewer can check each part of the spec in turn.
Read the specification first and split it into its parts (requirements, behaviours, acceptance criteria), in its own order and words.
Then read the diff from the base branch, and the surrounding code wherever a change's purpose is unclear.
Put each changed file under every part it serves; a file serving no part goes to "unrelated" with a short reason.
List the parts no change implements as "missing": that is what the reviewer most needs to know.
Do not judge the code's quality: only say what implements what.`,
  pr_description: `Write the pull request's description for a reviewer who has not seen the work.
Describe the change as the branch has it now: read the diff from the base branch, not only what you remember.
Say what changed and why, the main changes, and how it was verified. Mention what a reviewer should look at closely.
Keep it short and factual: no marketing, no list of every file.`,
  rebase: `Rebase your branch onto the latest base branch (\`origin/<base branch>\`, already fetched for you).
You are called because the host's own \`git rebase\` stopped on conflicts, or went through but broke the project's checks: the note below says which.
Resolve conflicts keeping the intent of both sides. Run the project's checks and fix anything the rebase broke.
If a conflict cannot be resolved safely, run \`git rebase --abort\` and explain why.
Never push.
Output a short markdown report: the conflicts met and how they were resolved, the checks run and their result.`,
  simplify: `Rewrite your branch's commits (since it left the base branch) into a history a reviewer can read commit by commit.
One commit per logical change, in an order that builds up; fold fix-ups, reverts and "address review" commits into the commit they fix. A small change can be one commit.
Write each message in the repository's style (look at \`git log\` on the base branch).
Do not change any file: the branch must end with exactly the same content, and the host refuses the result otherwise. Do not move it onto a newer base.
There is no editor or terminal: \`git rebase -i\` and \`git add -p\` cannot be used. For example: \`git reset --soft <fork point>\`, \`git reset\`, then \`git add <paths>\` and \`git commit -m\` for each commit; stage part of a file with \`git apply --cached\`.
Never push.
Output a short markdown report: the new commits' subject lines, and what was merged, split or reordered.`,
  lesson_writer: LESSON_WRITER_PROMPT,
};

export type AgentConfig = {
  agent: AgentId;
  /** Null only for `shared`. */
  model: AgentModel | null;
  /** Thinking effort; null: the CLI's default (always for the agents without a model). */
  effort: AgentEffort | null;
  prompt: string;
  defaultModel: AgentModel | null;
  defaultPrompt: string;
  /** Allowed tools; null for the agents that do not run on their own (`shared`, `rebase`, `simplify`). */
  tools: string[] | null;
  defaultTools: string[] | null;
  customized: boolean;
};

export function isAgentId(value: string): value is AgentId {
  return AGENT_IDS.some((agent) => agent === value);
}

const MODEL_BY_AGENT: Record<RunAgent, AgentModel> = {
  ...MODEL_BY_STEP,
  review_comments: 'opus',
  review_groups: 'sonnet',
  pr_description: MODEL_BY_STEP.implement,
  lesson_writer: 'haiku',
};
const RUN_AGENTS: readonly RunAgent[] = [
  ...STEPS,
  'review_comments',
  'review_groups',
  'pr_description',
  'lesson_writer',
];

/** Agents with a model of their own: the pipeline steps and the reviewer (not `shared`). */
function stepOf(agent: AgentId): RunAgent | null {
  return RUN_AGENTS.find((step) => step === agent) ?? null;
}

function defaultModel(agent: AgentId): AgentModel | null {
  const step = stepOf(agent);
  return step ? MODEL_BY_AGENT[step] : null;
}

function defaultTools(agent: AgentId): string[] | null {
  const step = stepOf(agent);
  return step ? [...DEFAULT_TOOLS[step]] : null;
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
  const fallbackModel = defaultModel(agent);
  const stored = storedChoices(row);
  const fallbackTools = defaultTools(agent);
  return {
    agent,
    model: fallbackModel === null ? null : (stored.model ?? fallbackModel),
    effort: fallbackModel === null ? null : stored.effort,
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
export function modelFor(db: Db, step: RunAgent): AgentModel {
  // The rebase and the simplification are the implementer's own session, so they keep its model.
  if (step === 'rebase' || step === 'simplify') {
    return modelFor(db, 'implement');
  }
  return resolveAgent(db, step).model ?? MODEL_BY_AGENT[step];
}

/** The thinking effort a run of `step` uses; null: the CLI's default. */
export function effortFor(db: Db, step: RunAgent): AgentEffort | null {
  // Like their model, they keep the implementer's effort.
  return resolveAgent(db, step === 'rebase' || step === 'simplify' ? 'implement' : step).effort;
}

/** The tools a run of `step` is allowed: the user's choice, else the step's defaults. */
export function toolsFor(db: Db, step: RunAgent): string[] {
  // The implementer's tools, plus the git commands a rebase or a simplification needs.
  if (step === 'rebase' || step === 'simplify') {
    return [...new Set([...toolsFor(db, 'implement'), ...DEFAULT_TOOLS[step]])];
  }
  return resolveAgent(db, step).tools ?? [...DEFAULT_TOOLS[step]];
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
  const tools = step && change.tools ? validateTools(db, change.tools) : null;
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

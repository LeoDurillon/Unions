import { asc, eq } from 'drizzle-orm';

import type { Db } from './db';
import { connectorTool, listConnectors } from './mcp-connectors';
import * as schema from './schema';
import type { Step } from './states';

/** Where the worker checks out the repository inside an agent container. */
export const AGENT_REPO_DIR = '/workspace/repo';

const READ_ONLY = ['Read', 'Grep', 'Glob'] as const;
const READ_GIT = ['diff', 'log', 'show', 'status'] as const;

/**
 * An agent that runs on its own: every pipeline step, the reviewer writing draft comments, and the
 * writer of pull request descriptions.
 */
export type RunAgent = Step | 'review_comments' | 'review_groups' | 'pr_description';

/** Reading a change with git, in both the plain and the `git -C <repo>` form agents often use. */
const REVIEW_TOOLS = [
  ...READ_ONLY,
  ...READ_GIT.map((command) => `Bash(git ${command}*)`),
  ...READ_GIT.map((command) => `Bash(git -C ${AGENT_REPO_DIR} ${command}*)`),
];

/** The tools each agent runs with until the user picks others. */
export const DEFAULT_TOOLS: Record<RunAgent, readonly string[]> = {
  intake: READ_ONLY,
  summary: READ_ONLY,
  technical: READ_ONLY,
  test_plan: READ_ONLY,
  implement: ['Read', 'Edit', 'Write', 'Grep', 'Glob', 'Bash'],
  final_review: REVIEW_TOOLS,
  review_comments: REVIEW_TOOLS,
  review_groups: REVIEW_TOOLS,
  pr_description: REVIEW_TOOLS,
  // Added to the implementer's tools for a rebase (see `toolsFor`).
  rebase: ['Bash(git rebase*)', 'Bash(git merge-base*)', 'Bash(git add*)', 'Bash(git status*)'],
};

/** Claude Code's own tools, always offered. */
export const BUILT_IN_TOOLS: readonly { name: string; description: string }[] = [
  { name: 'Read', description: 'Read files' },
  { name: 'Grep', description: 'Search file contents' },
  { name: 'Glob', description: 'Find files by name' },
  { name: 'Edit', description: 'Edit files' },
  { name: 'Write', description: 'Create or overwrite files' },
  { name: 'NotebookEdit', description: 'Edit Jupyter notebooks' },
  { name: 'Bash', description: 'Any shell command (denied git and network commands excepted)' },
  { name: 'Skill', description: "Run the repository's Claude Code skills (.claude/skills)" },
  { name: 'Task', description: 'Start sub-agents' },
  { name: 'WebFetch', description: 'Fetch a URL' },
  { name: 'WebSearch', description: 'Search the web' },
];

export type ToolOption = {
  name: string;
  description: string | null;
  /**
   * `built-in`: Claude Code's tools and the rules the defaults use; `custom`: added by the user;
   * `connector`: all the tools of one of the account's claude.ai connectors.
   */
  source: 'built-in' | 'custom' | 'connector';
};

/** A tool the list refuses: bad syntax, duplicate, built-in, or still selected by an agent. */
export class AgentToolError extends Error {}

/** A tool name (`WebFetch`, `mcp__notion__search`) with an optional rule in parentheses (`Bash(pnpm *)`). */
const TOOL_PATTERN = /^[A-Za-z][\w-]*(?:\([^(),]+\))?$/u;
const MAX_TOOL_LENGTH = 200;

export function isToolName(name: string): boolean {
  return name.length <= MAX_TOOL_LENGTH && TOOL_PATTERN.test(name);
}

function builtInOptions(): ToolOption[] {
  const options = BUILT_IN_TOOLS.map(({ name, description }): ToolOption => ({
    name,
    description,
    source: 'built-in',
  }));
  for (const name of Object.values(DEFAULT_TOOLS).flat()) {
    if (!options.some((option) => option.name === name)) {
      options.push({ name, description: null, source: 'built-in' });
    }
  }
  return options;
}

/** Everything an agent can be given: built-in tools, the account's connectors, then the user's, oldest first. */
export function listTools(db: Db): ToolOption[] {
  const custom = db
    .select()
    .from(schema.agentTools)
    .orderBy(asc(schema.agentTools.createdAt))
    .all()
    .map((row): ToolOption => ({ name: row.name, description: row.description, source: 'custom' }));
  const connectors = listConnectors(db).map((connector): ToolOption => ({
    name: connectorTool(connector.name),
    description: `claude.ai connector ${connector.name} (${connector.status})`,
    source: 'connector',
  }));
  const taken = new Set(connectors.map((tool) => tool.name));
  return [...builtInOptions(), ...connectors, ...custom.filter((tool) => !taken.has(tool.name))];
}

export function addTool(db: Db, input: { name: string; description?: string | null }): ToolOption {
  const name = input.name.trim();
  if (!isToolName(name)) {
    throw new AgentToolError(
      `"${name}" is not a tool name: use a name like WebFetch or mcp__server__tool, or a rule like Bash(pnpm test*)`,
    );
  }
  if (listTools(db).some((tool) => tool.name === name)) {
    throw new AgentToolError(`${name} is already in the list`);
  }
  const description = input.description?.trim() ?? '';
  db.insert(schema.agentTools)
    .values({ name, description: description === '' ? null : description })
    .run();
  return { name, description: description === '' ? null : description, source: 'custom' };
}

/** Agents whose saved tools include `name`. */
export function agentsUsingTool(db: Db, name: string): string[] {
  return db
    .select()
    .from(schema.agentConfigs)
    .all()
    .filter((row) => row.tools?.includes(name) === true)
    .map((row) => row.agent);
}

export function removeTool(db: Db, name: string): void {
  const custom = db.select().from(schema.agentTools).where(eq(schema.agentTools.name, name)).get();
  if (!custom) {
    throw new AgentToolError(`${name} is not a tool you added`);
  }
  const users = agentsUsingTool(db, name);
  if (users.length > 0) {
    throw new AgentToolError(`${name} is still selected for: ${users.join(', ')}`);
  }
  db.delete(schema.agentTools).where(eq(schema.agentTools.name, name)).run();
}

/** Checks a selection against the list; returns it without duplicates, in the list's order. */
export function validateTools(db: Db, tools: readonly string[]): string[] {
  const known = listTools(db).map((tool) => tool.name);
  const unknown = tools.filter((tool) => !known.includes(tool));
  if (unknown.length > 0) {
    throw new AgentToolError(`Unknown tools: ${unknown.join(', ')}. Add them to the list first.`);
  }
  if (tools.length === 0) {
    throw new AgentToolError('Select at least one tool');
  }
  return known.filter((tool) => tools.includes(tool));
}

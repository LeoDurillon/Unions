// The prompt writer: the prompt that turns a custom agent's name and role into its instructions, and its answer read back.
import { DEFAULT_PROMPTS } from './agents';
import type { AgentModel } from './states';

/** A written prompt longer than this is refused: the built-in ones are under 1,500 characters. */
export const MAX_WRITTEN_PROMPT_CHARS = 4000;

/** The writer's model and tools: it runs once per agent, everything it needs is in its prompt. */
export const PROMPT_WRITER_MODEL: AgentModel = 'sonnet';
export const PROMPT_WRITER_TOOLS: readonly string[] = ['Read'];

export class PromptWriterError extends Error {}

/** Everything the writer needs: the agent, what it receives, the house style, the format. */
export function promptWriterPrompt(agent: { name: string; role: string }): string {
  return `You write the instructions of one agent in an automated pipeline that works on tickets of a software repository.
The user created this agent and described its role in their own words. Turn that role into the agent's instructions.

# The agent

Name: ${agent.name}

Role, as the user wrote it:

<role>
${agent.role}
</role>

# What the agent receives

Before your instructions, the agent is given: the pipeline's shared instructions and the project's own, the ticket (its title and description), the files attached to it, and the approved outputs of the steps before it (for example the summary, the technical plan, the test plan).
The user places the agent in a ticket's flow, before or after the implementation. Placed after it, the agent is also told the ticket branch is checked out and how to read the diff from the base branch with git.
The agent reads the repository (Read, Grep, Glob, read-only git). It never changes a file, never commits and never pushes: it writes a markdown report, which the user approves or sends back with feedback, and which the steps after it receive.

# The house style

Write like the built-in agents' instructions: short imperative sentences, what to read, what to check, what to leave out, then the output format. No preamble, no role-play ("You are..."), no restating what the agent receives.
Two of them, as examples:

<example name="Technical">
${DEFAULT_PROMPTS.technical}
</example>

<example name="Final review">
${DEFAULT_PROMPTS.final_review}
</example>

# Your answer

Answer with the agent's instructions only: no heading, no code fence, no comment before or after.
Keep them under 1,500 characters. Make the role concrete: name what the agent looks for and what it must not report.
End with the output format: "Output one section starting with \`## ${agent.name}\`.", and its parts if the role calls for some.`;
}

const FENCE = /^```[\w-]*\n(?<body>[\s\S]*?)\n```$/u;

/** The written instructions, without a code fence around them; refused when empty or too long. */
export function parseWrittenPrompt(answer: string): string {
  const trimmed = answer.trim();
  const prompt = (FENCE.exec(trimmed)?.groups?.body ?? trimmed).trim();
  if (prompt === '') {
    throw new PromptWriterError('The prompt writer answered nothing');
  }
  if (prompt.length > MAX_WRITTEN_PROMPT_CHARS) {
    throw new PromptWriterError(
      `The written prompt is longer than ${MAX_WRITTEN_PROMPT_CHARS} characters`,
    );
  }
  return prompt;
}

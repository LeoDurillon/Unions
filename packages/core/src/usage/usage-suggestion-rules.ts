// The "Suggest improvements" prompt's account of how Union runs the agents. The rules it imposes,
// and each step's tools and denied commands.

import { BASE_DENIED, deniedFor } from '../agent/agent-denied';
import { toolsFor } from '../agent/agents';
import type { Db } from '../db';
import type { Step } from '../phases';

/** A step's allowed tools, and what it is denied on top of the commands every run is denied. */
export type StepRules = { step: Step; tools: readonly string[]; denied: readonly string[] };

const RULES = `## How Union runs the agents

Union starts each agent with its own allowed tools and denied commands (\`--allowedTools\`,
\`--disallowedTools\`). The repository's .claude/settings.json still loads, but a command Union denies stays
denied whatever it allows, and a step whose Bash is limited to patterns (such as \`Bash(git diff*)\`) refuses
every other command. Claude Code checks each part of a compound command on its own (\`&&\`, \`|\`, \`;\`,
\`$(…)\`, a \`cd\` prefix, a \`for\` loop), so one part outside the rules refuses the whole command. The
containers hold no GitHub credentials and fetch nothing from the network: \`gh\` and \`curl\` are denied on
purpose, do not propose allowing them. The worker owns the ticket's branch: it checks it out, pushes it and
starts rebases, so the implementer cannot switch, reset or rewrite it. Union's review steps are told to run
one git command per call, without \`&&\` or \`cd\`.

Propose only commands these rules allow. When a change needs a command they deny, say so under
"Union settings" instead of changing the repository's settings.`;

function list(rules: readonly string[]): string {
  return rules.map((rule) => `\`${rule}\``).join(', ');
}

function stepLine(rules: StepRules): string {
  const denied = rules.denied.length === 0 ? '' : `; also denied ${list(rules.denied)}`;
  return `- ${rules.step}: tools ${list(rules.tools)}${denied}`;
}

/** The rules section, for the steps that ran. */
export function rulesSection(steps: StepRules[]): string {
  return [
    RULES,
    `Every run is denied ${list(BASE_DENIED)}. Per step:\n${steps.map((rules) => stepLine(rules)).join('\n')}`,
  ].join('\n\n');
}

/** The rules of each step, as the next run of it would get them (the user's tool choices included). */
export function stepRules(db: Db, steps: Step[]): StepRules[] {
  return steps.map((step) => ({ step, tools: toolsFor(db, step), denied: deniedFor(step) }));
}

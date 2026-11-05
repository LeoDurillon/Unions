// The prompt of a "Suggest improvements" investigation: the project's usage findings as figures, and what to answer.
import type { ProjectFindings } from './project-findings';
import type { Finding, FindingItem, FindingKind } from './usage-findings';
import type { ProjectUsage } from './usage-summary';

const MICRO = 1_000_000;
const KILO = 1000;
/** Results are counted in characters; a token is about four of them. */
const CHARS_PER_TOKEN = 4;
/** A ticket's title past this is cut: the agent needs to tell tickets apart, not read them. */
const TITLE_LENGTH = 80;

/** What each finding measures, for the agent; its `value` and `calls` in words. */
const BRIEFS: Record<FindingKind, { title: string; figure: (item: FindingItem) => string }> = {
  large_sessions: {
    title: 'Steps whose sessions carry a large context (every turn reads it again)',
    figure: (item) =>
      `${Math.round(item.value / KILO)}k tokens on average over ${item.calls} calls`,
  },
  costly_tickets: {
    title: 'Tickets costing over three times the median ticket',
    figure: (item) =>
      `$${(item.value / MICRO).toFixed(2)} API-equivalent, ${item.calls} implementation calls`,
  },
  review_rounds: {
    title: 'Tickets reviewed more than three times',
    figure: (item) => `${item.value} reviews`,
  },
  large_outputs: {
    title: 'Shell commands whose output is large each time (it stays in the session)',
    figure: (item) =>
      `about ${Math.round(item.value / CHARS_PER_TOKEN / KILO)}k tokens over ${item.calls} calls`,
  },
  check_variants: {
    title: 'Checks (tests, lint, typecheck) run in many different forms',
    figure: (item) => `${item.value} forms over ${item.calls} runs`,
  },
  repeated_reads: {
    title: 'Files read again on ticket after ticket',
    figure: (item) => `${item.value} reads in ${item.calls} tickets`,
  },
  denied: {
    title: 'Commands the agents were refused (each costs a turn)',
    figure: (item) => `${item.value} refused`,
  },
  repeated_skills: {
    title: 'Skills loaded again and again',
    figure: (item) => `loaded ${item.value} times`,
  },
};

/** A ticket as the findings name it: its issue number, else Union's id. */
function ticketName(findings: ProjectFindings, id: number): string {
  const issue = findings.tickets[id]?.issueNumber ?? null;
  return issue === null ? `ticket ${id}` : `#${issue}`;
}

/** Each ticket named in the findings, once, with its title. */
function ticketList(findings: ProjectFindings): string {
  return Object.entries(findings.tickets)
    .map(([id, ticket]) => {
      const title =
        ticket.title.length > TITLE_LENGTH
          ? `${ticket.title.slice(0, TITLE_LENGTH)}…`
          : ticket.title;
      return `- ${ticketName(findings, Number(id))}: ${title}`;
    })
    .join('\n');
}

function itemLine(finding: Finding, item: FindingItem, findings: ProjectFindings): string {
  const tickets = item.tickets.map((id) => ticketName(findings, id)).join(', ');
  const isTicket = finding.kind === 'costly_tickets' || finding.kind === 'review_rounds';
  const label = isTicket ? tickets : `\`${item.label}\``;
  const seen = isTicket || tickets === '' ? '' : `; seen most in ${tickets}`;
  return `- ${label}: ${BRIEFS[finding.kind].figure(item)}${seen}`;
}

function findingSection(finding: Finding, findings: ProjectFindings): string {
  const who = finding.actor === 'union' ? 'Union' : 'the repository';
  const items = finding.items.map((item) => itemLine(finding, item, findings));
  return [`### ${BRIEFS[finding.kind].title} (for ${who})`, ...items].join('\n');
}

function stepLines(usage: ProjectUsage): string {
  return usage.steps
    .map(
      (step) =>
        `- ${step.step ?? 'outside a step'}: $${step.costUsd.toFixed(2)}, ${step.calls} calls`,
    )
    .join('\n');
}

const INTRO = `Union runs Claude Code agents on this repository for each ticket, in steps: intake, summary,
technical plan, test plan, implement (with its revisions and failed checks), final review, then rebase,
simplify and split when asked. Each agent reads the repository's CLAUDE.md and AGENTS.md files, its
.claude/ folder (skills, agents, rules) and the project instructions Union adds. Below is what Union
measured from the agents' logs. Costs are API-equivalent: on a Max subscription they show how fast the
usage limit is reached.`;

const ASK = `## What to do

Read the repository's CLAUDE.md and AGENTS.md files, its .claude/ folder, its package scripts and the files
the findings name. Then propose the changes that would make the agents spend the fewest tokens for the same
work, the largest saving first. Be concrete: the exact text to add and where, the script to write and what it
prints, the skill or subagent to create or remove. Do not change any file.

Answer in Markdown with these sections; leave out an empty one:

- \`## Changes to the repository\`: one \`###\` per change, each one a ticket a developer can do on its own:
  why (the finding and its figure), what to change (files and text), and how to tell it worked.
- \`## Union settings\`: changes in Union itself (a step's model, the project's instructions, the flow) for
  the findings marked "for Union", and what you cannot tell from the repository.
- \`## Lessons for the agents\`: one-line rules, each for one step (intake, technical, implement,
  final_review…), worth adding to the project's memory in Union.`;

/** The investigation's title and prompt, from the findings over `range` (e.g. "the last 30 days"). */
export function suggestionPrompt(
  findings: ProjectFindings,
  usage: ProjectUsage,
  range: string,
): { title: string; prompt: string } {
  const sections = findings.findings.map((finding) => findingSection(finding, findings));
  const prompt = [
    INTRO,
    `## Usage over ${range}`,
    `In all: $${usage.total.costUsd.toFixed(2)}, ${usage.total.calls} agent calls. Per step:\n${stepLines(usage)}`,
    `## What stands out`,
    ...sections,
    `## Tickets named above\n${ticketList(findings)}`,
    ASK,
  ].join('\n\n');
  return { title: `Suggest improvements from usage over ${range}`, prompt };
}

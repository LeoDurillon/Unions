// How the Usage page words each finding: its title, what to do about it, and the figure of each item.
import type { FindingItem, FindingKind } from '@union/core';

import { count } from './token-counts';
import { costText } from './usage-format';

/** Results are counted in characters; a token is about four of them. */
const CHARS_PER_TOKEN = 4;
const MICRO = 1_000_000;

type FindingText = {
  title: string;
  advice: string;
  /** The item's figure. */
  figure: (item: FindingItem) => string;
  /** The item is a ticket: its label is the ticket's title. */
  isTicket?: boolean;
};

export const FINDING_TEXTS: Record<FindingKind, FindingText> = {
  large_sessions: {
    title: 'Large sessions',
    advice:
      'These steps carry a large context on average, and every turn reads it again. Fresh sessions for them would cost less.',
    figure: (item) => `${count(item.value)} tokens on average, ${item.calls} calls`,
  },
  costly_tickets: {
    title: 'Tickets costing far more than the others',
    advice:
      'Over three times the median ticket. Look at their revisions and review rounds: a smaller ticket or a clearer spec usually costs less.',
    figure: (item) => `${costText(item.value / MICRO)}, ${item.calls} implementation calls`,
    isTicket: true,
  },
  review_rounds: {
    title: 'Many review rounds',
    advice:
      'Each round reads the change again and can send the implementer back once more. Feedback that settles the open points saves rounds.',
    figure: (item) => `${item.value} reviews`,
    isTicket: true,
  },
  large_outputs: {
    title: 'Commands that print a lot',
    advice:
      'Their output stays in the session and is read again at every turn. Ask for less (a summary, one file at a time), or give the repository a script that prints only what matters.',
    figure: (item) =>
      `about ${count(Math.round(item.value / CHARS_PER_TOKEN))} tokens over ${item.calls} calls`,
  },
  check_variants: {
    title: 'Checks run in many different ways',
    advice:
      'The agents work out how to run them on each ticket. One script that checks what changed, named in the repository’s CLAUDE.md, saves those turns.',
    figure: (item) => `${item.value} forms over ${item.calls} runs`,
  },
  repeated_reads: {
    title: 'Files read again on ticket after ticket',
    advice:
      'A short note in the CLAUDE.md or AGENTS.md of their folder (what each file holds, where things are) can spare reading them whole.',
    figure: (item) => `${item.value} reads in ${item.calls} tickets`,
  },
  denied: {
    title: 'Commands refused',
    advice:
      'Each refusal costs a turn. Tell the agents in CLAUDE.md how to write commands (one per call, no cd, no $(…)), or allow the tool in the agent’s settings.',
    figure: (item) => `${item.value} refused`,
  },
  over_estimate: {
    title: 'Changes far larger than their plan',
    advice:
      'Their first implementation added over half again the lines of code the technical plan estimated. When the trim pass cuts a lot, the implementer writes more than needed; when it cuts little, the plan under-estimates.',
    figure: (item) => `${item.calls} lines of code, ${item.value}% of the estimate`,
    isTicket: true,
  },
  repeated_skills: {
    title: 'Skills loaded again and again',
    advice:
      'A skill loaded on every ticket could be a few lines of the repository’s CLAUDE.md instead.',
    figure: (item) => `loaded ${item.value} times`,
  },
};

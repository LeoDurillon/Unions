// A slice's pull request description: written by the split's session from the repository's template, or rewritten later.
import { listSlices, resolveAgent, type Db, type Ticket, type TicketSlice } from '@union/core';

import {
  askDescription,
  findTemplate,
  OUTPUT_RULES,
  templateInstructions,
  type Template,
} from './pr-description';
import type { Rebase } from './rebase-agent';
import type { PublishedSlice } from './split-agent';

type Slice = Pick<PublishedSlice, 'position' | 'title' | 'spec' | 'tipSha'>;

/** Asks for one slice's description: its own change only, as the template wants it. */
export function slicePrompt(input: {
  guidance: string;
  template: Template | null;
  slice: Slice;
  /** Where the slice's own change starts: the tip of the slice below, or the fork point. */
  from: string;
}): string {
  const { slice } = input;
  const intro = input.guidance === '' ? '' : `${input.guidance}\n\n`;
  return `# Pull request description, slice ${slice.position}

${intro}Your branch is split into a stack, and a pull request is being opened for slice ${slice.position}, **${slice.title}**. Write its description, about this slice alone: its change is \`git diff ${input.from}...${slice.tipSha}\` (one git command per call: no \`&&\`, no \`cd\`). Do not change any file. Its part of the spec:

${slice.spec.trim()}

${templateInstructions(input.template)}

${OUTPUT_RULES} The stack and the ticket are listed under it for you too.`;
}

/** What a rewrite of `prNumber`'s description is about: the whole branch, one slice, or nothing now. */
export type RewriteTarget =
  | { kind: 'whole' }
  | { kind: 'slice'; slice: TicketSlice; below: TicketSlice | undefined }
  | { kind: 'gone' };

/** A split ticket's open slice, with the open one below it (none: its change starts at the base). */
export function rewriteTarget(db: Db, ticket: Ticket, prNumber: number): RewriteTarget {
  const slices = listSlices(db, ticket.id);
  if (slices.length < 2) {
    return ticket.prNumber === prNumber ? { kind: 'whole' } : { kind: 'gone' };
  }
  const open = slices.filter((slice) => slice.prState !== 'merged');
  const at = open.findIndex((slice) => slice.prNumber === prNumber);
  const slice = open[at];
  return slice ? { kind: 'slice', slice, below: open[at - 1] } : { kind: 'gone' };
}

/** Asks for one slice's description again, from the one on GitHub: its own change only. */
export function sliceRewritePrompt(input: {
  guidance: string;
  template: Template | null;
  slice: Slice;
  from: string;
  current: string;
  ticket: { title: string; body: string };
}): string {
  const { slice } = input;
  const current = input.current.trim() === '' ? '(empty)' : input.current;
  return `# Pull request description, slice ${slice.position}, rewritten

${input.guidance}

Your branch is split into a stack, and slice ${slice.position}, **${slice.title}**, has its own pull request. Its description below was written earlier. The branch changed since (reviews, revisions, rebases), so parts of it may be wrong or missing. Rewrite it to describe this slice alone, as it is now: its change is \`git diff ${input.from}...${slice.tipSha}\` (one git command per call: no \`&&\`, no \`cd\`). Do not change any file.

Keep what is still true, including anything a person added by hand. Fix what is no longer true, and add what is missing.

Its part of the spec:

${slice.spec.trim()}

${templateInstructions(input.template)}

## The ticket

# ${input.ticket.title}

${input.ticket.body}

## The current description

\`\`\`markdown
${current}
\`\`\`

${OUTPUT_RULES} The stack and the ticket are listed under it for you too.`;
}

/**
 * Each lower slice's description by its position, in the split's session; a slice whose turn
 * failed is left out and keeps the plan's spec. The top slice is the ticket's own pull request.
 */
export async function describeSlices(
  rebase: Rebase,
  input: { session: string; fork: string; slices: readonly Slice[] },
): Promise<Map<number, string>> {
  const { session, slices } = input;
  const { deps, context, container } = rebase;
  const describer = {
    db: deps.db,
    agent: deps.agent,
    sessionId: session,
    signal: context.signal,
    log: context.log,
  };
  const texts = new Map<number, string>();
  try {
    const template = await findTemplate(deps.runtime, container);
    context.log({ type: 'union_pr_description', template: template?.path ?? null, slices: true });
    const guidance = resolveAgent(deps.db, 'pr_description').prompt;
    for (const [at, slice] of slices.slice(0, -1).entries()) {
      const from = slices[at - 1]?.tipSha ?? input.fork;
      const prompt = slicePrompt({ guidance, template, slice, from });
      const text = await askDescription(deps.runtime, container, describer, prompt);
      if (text !== null) {
        texts.set(slice.position, text);
      }
    }
  } catch (error) {
    context.log({ type: 'union_pr_description_failed', error: String(error) });
  }
  return texts;
}

// A command's or the e2e tests' output as a review comment: what ran, how it ended, the last lines in a code block.
import { schema, type Db } from '@union/core';

/** Lines of output a comment quotes: enough to read the failure, not a log dump. */
const QUOTED_LINES = 60;
const MIN_FENCE = 3;

export type OutputOfRun = {
  command: string;
  exitCode: number | null;
  /** Why it did not run to its end (a timeout, a cancel), when it did not. */
  error: string | null;
  output: string;
  /** Failure screenshots the run left, which a GitHub review cannot carry. */
  screenshots?: number;
};

function longestBackticks(text: string): number {
  return Math.max(0, ...[...text.matchAll(/`+/gu)].map((match) => match[0].length));
}

/** A fence longer than any run of backticks in the text, so the output cannot close it. */
function fenceFor(text: string): string {
  return '`'.repeat(Math.max(MIN_FENCE, longestBackticks(text) + 1));
}

/** The command as inline code, whatever backticks it holds (spaced when it has some). */
function inlineCode(text: string): string {
  const longest = longestBackticks(text);
  const ticks = '`'.repeat(longest + 1);
  return longest === 0 ? `${ticks}${text}${ticks}` : `${ticks} ${text} ${ticks}`;
}

function ending(run: OutputOfRun): string {
  if (run.error) {
    return `did not finish: ${run.error}`;
  }
  return run.exitCode === 0 ? 'passed' : `exited with ${run.exitCode ?? 'an unknown code'}`;
}

export function outputComment(run: OutputOfRun): string {
  const lines = run.output.split('\n');
  const quoted = lines.slice(-QUOTED_LINES).join('\n').trimEnd();
  const parts = [`I ran ${inlineCode(run.command)} on this pull request: it ${ending(run)}.`];
  if (quoted !== '') {
    const fence = fenceFor(quoted);
    const cut = lines.length > QUOTED_LINES ? ` (the last ${QUOTED_LINES} lines)` : '';
    parts.push(`Output${cut}:\n\n${fence}text\n${quoted}\n${fence}`);
  }
  const shots = run.screenshots ?? 0;
  if (shots > 0) {
    parts.push(`${shots} failure screenshot(s) were taken; I can share them.`);
  }
  return parts.join('\n\n');
}

/** Adds the text as a draft about the whole pull request, for the user to edit before sending. */
export function addGeneralDraft(
  db: Db,
  review: { id: number; headSha: string | null },
  body: string,
): typeof schema.reviewComments.$inferSelect {
  return db
    .insert(schema.reviewComments)
    .values({
      reviewId: review.id,
      kind: 'general',
      path: '',
      side: 'new',
      startLine: 0,
      endLine: 0,
      excerpt: '',
      body,
      headSha: review.headSha ?? '',
    })
    .returning()
    .get();
}

// The text of a stack on GitHub: each slice's pull request description and the issue's comment.

/** A slice as GitHub shows it: its pull request is null until it is opened. */
export type StackEntry = { position: number; title: string; prNumber: number | null };

function prLabel(entry: StackEntry): string {
  return entry.prNumber === null ? entry.title : `#${entry.prNumber} ${entry.title}`;
}

function stackLine(entry: StackEntry, current: number): string {
  const label = prLabel(entry);
  return entry.position === current
    ? `${entry.position}. **${label}** (this pull request)`
    : `${entry.position}. ${label}`;
}

/** The stack as a list, bottom first, `current` marked. */
export function stackSection(stack: readonly StackEntry[], current: number): string {
  const lines = stack.map((entry) => stackLine(entry, current));
  return ['**Stack**, bottom first: merge from the bottom.', '', ...lines].join('\n');
}

/**
 * A slice's pull request description: the one the agent wrote, else its title and part of the
 * spec; then the stack and its issue. No `Closes #<issue>`: GitHub honours it only on a pull
 * request into the default branch, so Union closes the issue itself once every slice merged.
 */
export function slicePrDescription(input: {
  slice: { position: number; title: string; spec: string };
  stack: readonly StackEntry[];
  issueNumber: number | null;
  description?: string;
}): string {
  const { slice, stack, issueNumber } = input;
  const partOf = issueNumber === null ? [] : ['', `Part of #${issueNumber}.`];
  const text = input.description?.trim() ?? `## ${slice.title}\n\n${slice.spec.trim()}`;
  return [text, '', stackSection(stack, slice.position), ...partOf].join('\n');
}

const SECTION_START = '<!-- union:stack -->';
const SECTION_END = '<!-- /union:stack -->';

/** The ticket's own (top) pull request keeps its description; the stack goes in a section Union owns. */
export function withStackSection(body: string, section: string): string {
  const block = `${SECTION_START}\n${section}\n${SECTION_END}`;
  const start = body.indexOf(SECTION_START);
  const end = body.indexOf(SECTION_END);
  if (start !== -1 && end > start) {
    return `${body.slice(0, start)}${block}${body.slice(end + SECTION_END.length)}`;
  }
  return body.trim() === '' ? block : `${body.trimEnd()}\n\n${block}`;
}

/** The comment on the issue once split: `Split into a stack: #101 Migration → #102 CRUD`. */
export function stackComment(stack: readonly StackEntry[]): string {
  return `Split into a stack: ${stack.map((entry) => prLabel(entry)).join(' → ')}`;
}

/** A slice as a reviewer reads it: its part of the spec and where its own change ends. */
export type ReviewedSlice = { position: number; title: string; spec: string; tipSha: string };

/**
 * For an agent reviewing a split ticket: each slice's own change (a range to diff) and its part of
 * the spec, so findings can say which slice they are about. Empty when the ticket is not split.
 */
export function stackReviewNote(slices: readonly ReviewedSlice[], base: string): string {
  if (slices.length < 2) {
    return '';
  }
  const lines = slices.map((slice, at) => {
    const from = slices[at - 1]?.tipSha ?? base;
    const spec = slice.spec.trim().replaceAll('\n', ' ');
    return `${slice.position}. **${slice.title}**: \`git diff ${from}...${slice.tipSha}\`. Its part of the spec: ${spec}`;
  });
  return `\n\nThe branch is a stack of ${slices.length} pull requests, bottom first, each merged on the one below. Review each slice against its own part of the spec, and start each finding's comment with the slice it is about (\`Slice <n>:\`):\n\n${lines.join('\n')}`;
}

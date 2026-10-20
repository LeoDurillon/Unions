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

/**
 * A slice's pull request description. No `Closes #<issue>`: GitHub honours it only on a pull
 * request into the default branch, so Union closes the issue itself once every slice merged.
 */
export function slicePrDescription(input: {
  slice: { position: number; title: string; spec: string };
  stack: readonly StackEntry[];
  issueNumber: number | null;
}): string {
  const { slice, stack, issueNumber } = input;
  const lines = stack.map((entry) => stackLine(entry, slice.position));
  const partOf = issueNumber === null ? [] : ['', `Part of #${issueNumber}.`];
  return [
    `## ${slice.title}`,
    '',
    slice.spec.trim(),
    '',
    `**Stack**, bottom first: merge from the bottom.`,
    '',
    ...lines,
    ...partOf,
  ].join('\n');
}

/** The comment on the issue once split: `Split into a stack: #101 Migration → #102 CRUD`. */
export function stackComment(stack: readonly StackEntry[]): string {
  return `Split into a stack: ${stack.map((entry) => prLabel(entry)).join(' → ')}`;
}

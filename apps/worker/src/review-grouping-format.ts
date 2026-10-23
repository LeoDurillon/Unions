// What the grouping agent reads and answers in: the diff's hunks, one per line, and the answer's
// block.
import { hunksOf } from '@union/core';

/**
 * The diff's hunks, listed for the agent to cite: inside `.git` so its read tools reach it and git
 * leaves it out of the change. Removed after the run.
 */
export const HUNK_INDEX = '.git/union-review-hunks.md';

/** Appended by the host, never editable: the grouping is read from this block. */
export const GROUPING_FORMAT = `End your answer with one fenced \`json\` block, and nothing after it:

\`\`\`json
{"groups": [{"title": "Automatic unpublishing", "spec": "the part of the specification, quoted", "summary": "what these changes do for it", "files": ["src/campaign/activate.ts"], "hunks": [{"path": "src/campaign/api.ts", "lines": [120, 245]}]}],
 "unrelated": [{"path": "package.json", "reason": "dependency bump"}, {"path": "src/campaign/api.ts", "lines": [310], "reason": "renames a helper"}],
 "missing": [{"spec": "the part of the specification, quoted", "note": "why you think no change implements it"}]}
\`\`\`

- \`groups\`: one per part of the specification, in its order. A file or a hunk can be under several groups.
- \`files\`: the files all of whose changes serve this part, paths as the diff shows them.
- \`hunks\`: for a file only some of whose changes serve this part, those hunks, each named by its line in \`${HUNK_INDEX}\` (the new-side start line of its \`@@\` header). Name whole files in \`files\` whenever you can: list hunks only for files split between parts.
- \`unrelated\`: changes no part of the specification asked for: a whole file, or some of its hunks with \`lines\`.
- \`missing\`: parts of the specification no change implements.`;

/** Every changed file's hunks, one line each: what the agent cites in `hunks` and `lines`. */
export function hunkIndex(files: { path: string; patch: string }[]): string {
  const sections = files.map(({ path, patch }) => {
    const hunks = hunksOf(patch);
    const lines =
      hunks.length === 0
        ? ['- no hunks (binary, renamed or mode change only): place the whole file']
        : hunks.map(
            (hunk) =>
              `- line ${hunk.newStart}: \`${hunk.header}\` (+${hunk.additions} −${hunk.deletions})`,
          );
    return `## ${path}\n\n${lines.join('\n')}`;
  });
  return `# The change's hunks\n\nCite a hunk by its line.\n\n${sections.join('\n\n')}\n`;
}

import type { GroupingResult, SpecGroup } from '@union/core';

/** Appended by the host, never editable: the grouping is read from this block. */
export const GROUPING_FORMAT = `End your answer with one fenced \`json\` block, and nothing after it:

\`\`\`json
{"groups": [{"title": "Automatic unpublishing", "spec": "the part of the specification, quoted", "summary": "what these files do for it", "files": ["src/campaign/activate.ts"]}],
 "unrelated": [{"path": "package.json", "reason": "dependency bump"}],
 "missing": [{"spec": "the part of the specification, quoted", "note": "why you think no change implements it"}]}
\`\`\`

- \`groups\`: one per part of the specification, in its order. \`files\`: paths as the diff shows them; a file can be in several groups.
- \`unrelated\`: changed files no part of the specification asked for.
- \`missing\`: parts of the specification no change implements.`;

const JSON_BLOCK = /```json[^\n]*\n(?<json>[\s\S]*?)\n\s*```/gu;
const MAX_GROUPS = 40;
const MAX_TEXT = 2000;
const NOT_PLACED = 'Not placed by the agent';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, MAX_TEXT) : '';
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** The last JSON block holding `groups`, as the agent wrote it; null when there is none. */
function lastBlock(answer: string): Record<string, unknown> | null {
  const blocks = [...answer.matchAll(JSON_BLOCK)].toReversed();
  for (const block of blocks) {
    try {
      const parsed: unknown = JSON.parse(block.groups?.json ?? '');
      if (isRecord(parsed) && Array.isArray(parsed.groups)) {
        return parsed;
      }
    } catch {
      // Not this block: an earlier one may be the answer.
    }
  }
  return null;
}

/** `Automatic unpublishing` → `automatic-unpublishing`, unique among the keys already taken. */
function keyOf(title: string, taken: Set<string>): string {
  const base =
    title
      .normalize('NFKD')
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/gu, '-')
      .replaceAll(/^-|-$/gu, '') || 'part';
  let key = base;
  for (let count = 2; taken.has(key); count += 1) {
    key = `${base}-${count}`;
  }
  taken.add(key);
  return key;
}

function groupsOf(
  raw: unknown[],
  changed: Set<string>,
): {
  groups: SpecGroup[];
  empty: { spec: string; note: string }[];
} {
  const taken = new Set<string>();
  const groups: SpecGroup[] = [];
  const empty: { spec: string; note: string }[] = [];
  for (const item of raw.slice(0, MAX_GROUPS).filter((entry) => isRecord(entry))) {
    const title = text(item.title);
    if (title !== '') {
      const files = [...new Set(list(item.files).map((path) => text(path)))].filter((path) =>
        changed.has(path),
      );
      const spec = text(item.spec);
      if (files.length === 0) {
        empty.push({ spec: spec || title, note: 'No changed file placed under it' });
      } else {
        groups.push({ key: keyOf(title, taken), title, spec, summary: text(item.summary), files });
      }
    }
  }
  return { groups, empty };
}

/**
 * The agent's grouping, checked against the change: only changed files, each at least once (the
 * ones it left out go to `unrelated`), no empty group (its part goes to `missing`). Null when the
 * answer has no grouping block.
 */
export function parseGrouping(answer: string, paths: string[]): GroupingResult | null {
  const block = lastBlock(answer);
  if (!block) {
    return null;
  }
  const changed = new Set(paths);
  const { groups, empty } = groupsOf(list(block.groups), changed);
  const grouped = new Set(groups.flatMap((group) => group.files));
  const unrelated = list(block.unrelated)
    .filter((item) => isRecord(item))
    .map((item) => ({ path: text(item.path), reason: text(item.reason) }))
    .filter((item) => changed.has(item.path) && !grouped.has(item.path));
  const listed = new Set([...grouped, ...unrelated.map((item) => item.path)]);
  const missing = list(block.missing)
    .filter((item) => isRecord(item))
    .map((item) => ({ spec: text(item.spec), note: text(item.note) }))
    .filter((item) => item.spec !== '');
  return {
    groups,
    unrelated: [
      ...new Map(unrelated.map((item) => [item.path, item])).values(),
      ...paths.filter((path) => !listed.has(path)).map((path) => ({ path, reason: NOT_PLACED })),
    ],
    missing: [...missing, ...empty],
  };
}

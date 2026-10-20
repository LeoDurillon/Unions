// The split plan's format: the slices an agent proposes for a stack, as markdown the user can edit.

/** A slice as the plan proposes it: bottom first, `position` 1. */
export type PlannedSlice = { position: number; title: string; spec: string };

export type SplitPlan = { ok: true; slices: PlannedSlice[] } | { ok: false; problems: string[] };

/** The output format the planning agent is asked for; `parseSplitPlan` reads it back. */
export const SPLIT_PLAN_FORMAT = `Output one section per slice, bottom first, and nothing else at the top level:

## Slice 1: <short title>

**Spec:** the part of the spec this slice implements, in a few sentences: it becomes its pull request's description.

**Changes:** the files, and the hunks when a file is split between slices, that go into it.

**Stands alone:** why it builds and passes the checks on the slices below it, and how it is safe to ship before the slices above it (not reachable yet, behind a feature flag, ...).

## Slice 2: <short title>

...

Propose at least two slices and no more than the spec has parts.`;

const MIN_SLICES = 2;
const SLICE_HEADING = /^## Slice (?<position>\d+):[ \t]*(?<title>.*)$/gmu;
const SECTION_END = /^## /mu;
const SPEC = /^\*\*Spec:\*\*(?<spec>[\s\S]*?)(?=^\*\*[^*\n]+:\*\*|(?![\s\S]))/mu;

function sectionAfter(text: string, start: number): string {
  const rest = text.slice(start);
  const end = SECTION_END.exec(rest);
  return end === null ? rest : rest.slice(0, end.index);
}

type Found = { position: number; title: string; body: string };

function headings(text: string): Found[] {
  return [...text.matchAll(SLICE_HEADING)].map((match) => ({
    position: Number(match.groups?.position),
    title: (match.groups?.title ?? '').trim(),
    body: sectionAfter(text, match.index + match[0].length),
  }));
}

function sliceProblems(found: Found, expected: number): string[] {
  const problems: string[] = [];
  if (found.position !== expected) {
    problems.push(`Slice ${found.position} comes where slice ${expected} was expected.`);
  }
  if (found.title === '') {
    problems.push(`Slice ${found.position} has no title.`);
  }
  if ((SPEC.exec(found.body)?.groups?.spec ?? '').trim() === '') {
    problems.push(`Slice ${found.position} has no \`**Spec:**\` paragraph.`);
  }
  return problems;
}

/** The slices of a plan in `SPLIT_PLAN_FORMAT`, numbered 1 to n, each with a title and its spec. */
export function parseSplitPlan(text: string): SplitPlan {
  const found = headings(text);
  if (found.length < MIN_SLICES) {
    return {
      ok: false,
      problems: [`A split needs at least ${MIN_SLICES} \`## Slice <n>: <title>\` sections.`],
    };
  }
  const problems = found.flatMap((slice, at) => sliceProblems(slice, at + 1));
  if (problems.length > 0) {
    return { ok: false, problems };
  }
  const slices = found.map((slice) => ({
    position: slice.position,
    title: slice.title,
    spec: (SPEC.exec(slice.body)?.groups?.spec ?? '').trim(),
  }));
  return { ok: true, slices };
}

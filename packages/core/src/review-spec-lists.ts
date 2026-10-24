// What a review's spec list starts with, a stack's specs from its members', and the specs as the one
// text Group by spec reads. Pure, browser-safe.
import { MAX_SPEC_CHARS, MAX_SPECS, type AgentReviewSpec } from './agent-review-specs';
import { SPEC_SOURCES, type SpecSource } from './spec-source-kinds';

/** A spec as the list keeps it: where it comes from (`ref`: a page id, an issue number). */
export type SpecEntry = { kind: SpecSource; ref: string | null; label: string; url: string | null };

/** What the list starts from, before the user changes it. */
export type SpecOwnerFacts =
  | { kind: 'ticket'; notionOrigin: { id: string; url: string | null } | null }
  | { kind: 'review'; prNumber: number };

/** The ticket's text and the page it came from, or the pull request's description. */
export function startingSpecs(facts: SpecOwnerFacts): SpecEntry[] {
  if (facts.kind === 'review') {
    return [{ kind: 'pr', ref: null, label: `PR #${facts.prNumber} description`, url: null }];
  }
  const origin: SpecEntry[] = facts.notionOrigin
    ? [
        {
          kind: 'notion',
          ref: facts.notionOrigin.id,
          label: 'Notion page',
          url: facts.notionOrigin.url,
        },
      ]
    : [];
  return [{ kind: 'ticket', ref: null, label: 'Ticket description', url: null }, ...origin];
}

/** Two entries name the same source. */
export function sameSource(
  a: Pick<SpecEntry, 'kind' | 'ref'>,
  b: Pick<SpecEntry, 'kind' | 'ref'>,
): boolean {
  return a.kind === b.kind && (a.ref ?? null) === (b.ref ?? null);
}

/** The starting specs the list has never had (a removed one counts as had: it stays removed). */
export function missingStarts(
  had: Pick<SpecEntry, 'kind' | 'ref'>[],
  starts: SpecEntry[],
): SpecEntry[] {
  return starts.filter((start) => !had.some((row) => sameSource(row, start)));
}

/** A stack member's specs: what each says, and where it comes from. */
export type MemberSpecs = {
  number: number;
  specs: (Pick<SpecEntry, 'kind' | 'ref'> & { label: string; text: string })[];
};

/**
 * The stack's specs for one agent review: each member's, linked to its pull request; a source shared by
 * several members (a Notion page) once, linked to all of them.
 */
export function stackSpecs(members: MemberSpecs[]): AgentReviewSpec[] {
  const merged: (AgentReviewSpec & { ref: string | null })[] = [];
  for (const member of members) {
    for (const spec of member.specs) {
      const shared =
        spec.ref === null ? undefined : merged.find((other) => sameSource(other, spec));
      if (shared) {
        shared.prs.push(member.number);
      } else {
        merged.push({
          kind: spec.kind,
          ref: spec.ref,
          label: spec.label,
          text: spec.text,
          prs: [member.number],
        });
      }
    }
  }
  return merged.map(({ kind, label, text, prs }) => ({ kind, label, text, prs }));
}

/** The specs as one text for Group by spec: each a titled section, so its parts can come from any of them. */
export function groupingText(specs: { label: string; text: string }[]): string {
  if (specs.length === 1) {
    return specs[0]?.text ?? '';
  }
  return specs.map((spec) => `# ${spec.label}\n\n${spec.text}`).join('\n\n');
}

/** What the grouping records as its source: the one spec's label, or how many. */
export function groupingLabel(specs: { label: string }[]): string {
  return specs.length === 1 ? (specs[0]?.label ?? 'Spec') : `${specs.length} specs`;
}

/** At most this many entries in a saved list, removed ones included. */
const MAX_SAVED = 30;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/** One entry of a saved list, or why it is refused. */
function savedOf(value: unknown, position: number): SavedSpecEntry | string {
  const name = `Spec ${position}`;
  if (!isRecord(value) || !SPEC_SOURCES.some((source) => source === value.kind)) {
    return `${name}: "kind" must be one of ${SPEC_SOURCES.join(', ')}`;
  }
  const label = optionalString(value.label);
  if (label === null) {
    return `${name}: a label is needed`;
  }
  const text = optionalString(value.text);
  if (text !== null && text.length > MAX_SPEC_CHARS) {
    return `${name} is longer than ${MAX_SPEC_CHARS} characters: keep the part that matters`;
  }
  return {
    kind: SPEC_SOURCES.find((source) => source === value.kind) ?? 'pr',
    ref: optionalString(value.ref),
    label: label.trim(),
    url: optionalString(value.url),
    text,
    removed: value.removed === true,
  };
}

/** A spec as the user saves it: where it comes from, its edited text (null: the source's), removed. */
export type SavedSpecEntry = SpecEntry & { text: string | null; removed: boolean };

/** The list the Specs bar saves, or why it is refused. */
export function parseSavedSpecs(value: unknown): { specs: SavedSpecEntry[] } | { error: string } {
  if (!Array.isArray(value) || value.length > MAX_SAVED) {
    return { error: `"specs" must be a list of at most ${MAX_SAVED}` };
  }
  const specs: SavedSpecEntry[] = [];
  for (const [index, item] of value.entries()) {
    const spec = savedOf(item, index + 1);
    if (typeof spec === 'string') {
      return { error: spec };
    }
    specs.push(spec);
  }
  if (specs.filter((spec) => !spec.removed).length > MAX_SPECS) {
    return { error: `At most ${MAX_SPECS} specs` };
  }
  return { specs };
}

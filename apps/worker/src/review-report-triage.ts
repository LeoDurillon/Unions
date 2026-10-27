// The report's triage read from the agent's block: what needs the reviewer (with every gap it left out
// added), the files they can skim, and the changed files the report says nothing about.
import {
  ATTENTION_KINDS,
  type AttentionItem,
  type AttentionKind,
  type ReportRequirement,
  type RequirementStatus,
  type SkimFile,
} from '@union/core';

import { keep, oneOf, pathOf, records, text, type Parsed } from './review-report-fields';
import { MAX_ATTENTION } from './review-report-format';
import { evidenceOf } from './review-report-items';

/** A requirement in one of these states always needs the reviewer. */
const GAP_KINDS: Partial<Record<RequirementStatus, AttentionKind>> = {
  differs: 'differs',
  missing: 'missing',
  partial: 'partial',
};

/**
 * The agent's items, in its order, at most `MAX_ATTENTION`; `keys` maps its names for the requirements
 * to their keys. Lines that cannot be read are dropped and counted.
 */
export function attentionOf(value: unknown, keys: Map<string, string>): Parsed<AttentionItem> {
  let dropped = 0;
  const parsed = keep(records(value), (item) => {
    const title = text(item.title);
    if (title === '') {
      return null;
    }
    const cites = evidenceOf(item.lines);
    dropped += cites.dropped;
    return {
      kind: oneOf(ATTENTION_KINDS, item.kind) ?? 'risk',
      title,
      detail: text(item.detail),
      requirement: keys.get(text(item.requirement)) ?? null,
      cites: cites.items,
    };
  });
  const items = parsed.items.slice(0, MAX_ATTENTION);
  return { items, dropped: dropped + parsed.dropped + parsed.items.length - items.length };
}

/** The agent's items, then one for each requirement differing, missing or partial it did not name. */
export function withGaps(
  attention: AttentionItem[],
  requirements: ReportRequirement[],
): AttentionItem[] {
  const named = new Set(attention.flatMap((item) => item.requirement ?? []));
  const gaps = requirements.flatMap((requirement): AttentionItem[] => {
    const kind = GAP_KINDS[requirement.status];
    if (kind === undefined || named.has(requirement.key)) {
      return [];
    }
    const { title, note, key, evidence } = requirement;
    return [{ kind, title, detail: note, requirement: key, cites: evidence }];
  });
  return [...attention, ...gaps];
}

/** Changed files to skim, each once; never one the reviewer is told to read (`read`). */
export function skimOf(
  value: unknown,
  changed: ReadonlySet<string>,
  read: ReadonlySet<string>,
): Parsed<SkimFile> {
  const seen = new Set<string>();
  return keep(records(value), (item) => {
    const path = pathOf(item.path);
    if (path === null || !changed.has(path) || read.has(path) || seen.has(path)) {
      return null;
    }
    seen.add(path);
    return { path, why: text(item.why) };
  });
}

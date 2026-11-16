// What the review page shows of its Explain conversations: their turns, spec parts, and whether they are outdated.

import {
  conversationsOf,
  explanationsOf,
  latestGrouping,
  turnSpecParts,
  type Db,
  type ExplainConversation,
  type ReviewExplanation,
  type SpecPart,
} from '@union/core';

import type { GroupingTarget } from './review-groupings';

/** A turn as the page shows it; `specs` are only the names of the specs it was given. */
export type ExplanationView = Omit<
  ReviewExplanation,
  'specs' | 'sessionId' | 'ticketId' | 'reviewId'
> & {
  specs: string[];
  /** The review shows another commit now. */
  outdated: boolean;
  /** The parts of the review's grouping by spec its lines belong to (none without a grouping). */
  specParts: SpecPart[];
  /** That grouping read another commit than the one shown now. */
  partsOutdated: boolean;
};

/** A conversation with its turns, first question first. */
export type ConversationView = Omit<ExplainConversation, 'ticketId' | 'reviewId'> & {
  turns: ExplanationView[];
};

type Parts = Pick<ExplanationView, 'specParts' | 'partsOutdated'>;

/** The spec parts of a turn's lines, from the review's newest succeeded grouping, each part once. */
function partsFinder(db: Db, target: GroupingTarget): (explanation: ReviewExplanation) => Parts {
  const grouping = latestGrouping(db, target.owner);
  const result = grouping?.status === 'succeeded' ? grouping.result : null;
  const partsOutdated = grouping?.headSha !== target.headSha;
  return (explanation) => {
    const specParts = result ? turnSpecParts(result, explanation.subjects, target.patchOf) : [];
    return { specParts, partsOutdated: specParts.length > 0 && partsOutdated };
  };
}

function view(
  explanation: ReviewExplanation,
  target: GroupingTarget,
  parts: Parts,
): ExplanationView {
  const { specs, sessionId: _session, ticketId: _ticket, reviewId: _review, ...rest } = explanation;
  return {
    ...rest,
    specs: specs.map((spec) => spec.label),
    outdated: target.headSha !== null && explanation.headSha !== target.headSha,
    ...parts,
  };
}

/** One turn as the page shows it. */
export function explanationView(
  db: Db,
  target: GroupingTarget,
  explanation: ReviewExplanation,
): ExplanationView {
  return view(explanation, target, partsFinder(db, target)(explanation));
}

/** The review's conversations, the one asked in last first, each with its turns oldest first. */
export function conversationViews(db: Db, target: GroupingTarget): ConversationView[] {
  const parts = partsFinder(db, target);
  const turns = new Map<number, ExplanationView[]>();
  for (const row of explanationsOf(db, target.owner).toReversed()) {
    const list = turns.get(row.conversationId) ?? [];
    list.push(view(row, target, parts(row)));
    turns.set(row.conversationId, list);
  }
  return conversationsOf(db, target.owner).map(
    ({ id, title, createdAt, updatedAt }): ConversationView => ({
      id,
      title,
      createdAt,
      updatedAt,
      turns: turns.get(id) ?? [],
    }),
  );
}

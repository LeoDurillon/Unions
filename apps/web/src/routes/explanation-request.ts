// Reads a request to explain lines of the diff, or to follow up on an explanation, into what is queued.
import {
  diffExcerpt,
  explanationOwner,
  getExplanation,
  parseAgentReviewSpecs,
  type AgentReviewOwner,
  type Db,
  type ExplanationRequest,
} from '@union/core';

import { BAD_REQUEST, CONFLICT, fail, NOT_FOUND, optionalText, requireText } from '../http';
import type { GroupingTarget } from './review-groupings';

const MAX_QUESTION_CHARS = 2000;

function sameOwner(a: AgentReviewOwner, b: AgentReviewOwner): boolean {
  return a.kind === b.kind && a.id === b.id;
}

function questionOf(body: Record<string, unknown>): string | null {
  const question = optionalText(body, 'question') ?? null;
  if (question !== null && question.length > MAX_QUESTION_CHARS) {
    throw fail(BAD_REQUEST, `A question can be at most ${MAX_QUESTION_CHARS} characters`);
  }
  return question;
}

/** A follow-up asks about the same lines, against the same specs, as the explanation it follows. */
function followUp(
  db: Db,
  target: GroupingTarget,
  parentId: number,
  question: string | null,
): ExplanationRequest {
  const parent = getExplanation(db, parentId);
  if (!parent || !sameOwner(explanationOwner(parent), target.owner)) {
    throw fail(NOT_FOUND, 'Unknown explanation');
  }
  if (question === null) {
    throw fail(BAD_REQUEST, 'A follow-up needs a question');
  }
  if (parent.status !== 'succeeded') {
    throw fail(CONFLICT, 'Follow up once the explanation has an answer');
  }
  const { path, side, startLine: start, endLine: end, excerpt, specs, headSha } = parent;
  return { path, side, start, end, excerpt, question, specs, headSha, parentId };
}

function rangeOf(
  body: Record<string, unknown>,
): Pick<ExplanationRequest, 'side' | 'start' | 'end'> {
  const start = Number(body.start);
  const end = Number(body.end ?? body.start);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
    throw fail(BAD_REQUEST, 'Give a valid start and end line');
  }
  return { side: body.side === 'old' ? 'old' : 'new', start, end };
}

/** The lines asked about, checked against the diff the review shows, with the specs sent. */
export function explanationRequest(
  db: Db,
  target: GroupingTarget,
  body: Record<string, unknown>,
): ExplanationRequest {
  const question = questionOf(body);
  if (typeof body.parentId === 'number') {
    return followUp(db, target, body.parentId, question);
  }
  const path = requireText(body, 'path');
  const { side, start, end } = rangeOf(body);
  const patch = target.patchOf(path);
  if (patch === undefined || target.headSha === null) {
    throw fail(BAD_REQUEST, `${path} is not in the current diff`);
  }
  const excerpt = diffExcerpt(patch, side, start, end);
  if (excerpt === null) {
    throw fail(BAD_REQUEST, 'Those lines are not part of the diff');
  }
  const specs = parseAgentReviewSpecs(body.specs ?? []);
  if ('error' in specs) {
    throw fail(BAD_REQUEST, specs.error);
  }
  return {
    path,
    side,
    start,
    end,
    excerpt,
    question,
    specs: specs.specs,
    headSha: target.headSha,
    parentId: null,
  };
}

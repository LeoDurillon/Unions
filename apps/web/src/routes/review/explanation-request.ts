// Reads a turn to ask, in a new Explain conversation or an existing one: its subjects checked against the diff.

import {
  diffExcerpt,
  isRecord,
  parseAgentReviewSpecs,
  type AgentReviewSpec,
  type ExplainSubject,
  type ExplanationRequest,
} from '@union/core';

import { BAD_REQUEST, fail, optionalText } from '../../http';
import type { GroupingTarget } from './review-groupings';

const MAX_QUESTION_CHARS = 2000;
const MAX_SUBJECTS = 10;

function questionOf(body: Record<string, unknown>): string | null {
  const question = optionalText(body, 'question') ?? null;
  if (question !== null && question.length > MAX_QUESTION_CHARS) {
    throw fail(BAD_REQUEST, `A question can be at most ${MAX_QUESTION_CHARS} characters`);
  }
  return question;
}

function pathIn(target: GroupingTarget, value: unknown): { path: string; patch: string } {
  const path = typeof value === 'string' ? value.trim() : '';
  const patch = path === '' ? undefined : target.patchOf(path);
  if (patch === undefined) {
    throw fail(BAD_REQUEST, `${path || 'That file'} is not in the current diff`);
  }
  return { path, patch };
}

/** Lines of a file of the diff, with the text the diff shows for them. */
function linesOf(target: GroupingTarget, item: Record<string, unknown>): ExplainSubject {
  const { path, patch } = pathIn(target, item.path);
  const start = Number(item.start);
  const end = Number(item.end ?? item.start);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
    throw fail(BAD_REQUEST, 'Give a valid start and end line');
  }
  const side = item.side === 'old' ? 'old' : 'new';
  const excerpt = diffExcerpt(patch, side, start, end);
  if (excerpt === null) {
    throw fail(BAD_REQUEST, 'Those lines are not part of the diff');
  }
  return { kind: 'lines', path, side, start, end, excerpt };
}

function subjectOf(target: GroupingTarget, item: unknown): ExplainSubject {
  if (!isRecord(item)) {
    throw fail(BAD_REQUEST, 'A subject is an object');
  }
  switch (item.kind) {
    case 'lines': {
      return linesOf(target, item);
    }
    case 'file': {
      return { kind: 'file', path: pathIn(target, item.path).path };
    }
    case 'change': {
      return { kind: 'change' };
    }
    default: {
      throw fail(BAD_REQUEST, 'A subject is lines, a file or the change');
    }
  }
}

/** The subjects asked about, each checked against the diff the review shows, the same one once. */
function subjectsOf(target: GroupingTarget, value: unknown): ExplainSubject[] {
  const items = value ?? [];
  if (!Array.isArray(items) || items.length > MAX_SUBJECTS) {
    throw fail(BAD_REQUEST, `Give at most ${MAX_SUBJECTS} subjects`);
  }
  const seen = new Set<string>();
  return items
    .map((item) => subjectOf(target, item))
    .filter((subject) => {
      const key = JSON.stringify(subject);
      const fresh = !seen.has(key);
      seen.add(key);
      return fresh;
    });
}

/** The specs sent, or null when none were given (a later turn keeps its conversation's). */
function specsOf(body: Record<string, unknown>): AgentReviewSpec[] | null {
  if (body.specs === undefined) {
    return null;
  }
  const specs = parseAgentReviewSpecs(body.specs);
  if ('error' in specs) {
    throw fail(BAD_REQUEST, specs.error);
  }
  return specs.specs;
}

function conversationOf(body: Record<string, unknown>): number | null {
  const id = body.conversationId ?? null;
  if (id !== null && (typeof id !== 'number' || !Number.isInteger(id))) {
    throw fail(BAD_REQUEST, 'Give a valid conversation id');
  }
  return id;
}

/** A turn: what it asks about (at least a subject or a question), where, and against which specs. */
export function explanationRequest(
  target: GroupingTarget,
  body: Record<string, unknown>,
): ExplanationRequest {
  if (target.headSha === null) {
    throw fail(BAD_REQUEST, 'The review has no diff to explain yet');
  }
  const question = questionOf(body);
  const subjects = subjectsOf(target, body.subjects);
  if (subjects.length === 0 && question === null) {
    throw fail(BAD_REQUEST, 'Ask a question or pick something to explain');
  }
  return {
    conversationId: conversationOf(body),
    subjects,
    question,
    specs: specsOf(body),
    headSha: target.headSha,
  };
}

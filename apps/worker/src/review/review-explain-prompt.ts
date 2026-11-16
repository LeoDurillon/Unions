// The prompts of an Explain turn, fresh (specs, change, subjects, the conversation so far) or resumed, and when to resume.
import {
  resolveAgent,
  sharedPrompt,
  type AgentReviewSpec,
  type Db,
  type ReviewExplanation,
  type SpecPart,
} from '@union/core';

import type { ReviewTarget } from './agent-review-target';
import { questionOf, subjectNames, subjectsOf } from './review-explain-subjects';

/** A fresh prompt carries at most this many earlier turns, newest kept... */
const MAX_HISTORY_TURNS = 6;
/** ...and at most this many characters of them. */
const MAX_HISTORY_CHARS = 20_000;

/** Past this many turns, a conversation goes on in a fresh session with its turns as text. */
const MAX_RESUMED_TURNS = 8;

/** Appended by the host, never editable: the explanation is read from this block. */
const EXPLANATION_FORMAT = `End your answer with one fenced \`json\` block, and nothing after it:

\`\`\`json
{"explanation": "Markdown: your answer, citing code as \`path:line\`.",
 "specs": [{"source": "the spec's name, exactly as given", "quote": "its words, copied exactly", "how": "how the code implements it"}],
 "docs": [{"path": "docs/spec/export.md", "heading": "Limits", "why": "how it relates to the code"}],
 "notInSpec": "only when no spec asks for this code: why it is there anyway"}
\`\`\`

- \`explanation\`: a few short paragraphs at most.
- \`specs\`: only quotes copied word for word from the specifications above; leave it empty when none applies.
- \`docs\`: the repository's own documents the code relates to, paths from the repository root.`;

function specsOf(specs: AgentReviewSpec[]): string {
  if (specs.length === 0) {
    return '## Specifications\n\nNone were given: leave `specs` empty.';
  }
  const parts = specs.map((spec) => `### ${spec.label}\n\n${spec.text}`);
  return `## Specifications\n\nCite them by their name (the heading).\n\n${parts.join('\n\n')}`;
}

function partsOf(parts: SpecPart[]): string {
  if (parts.length === 0) {
    return '';
  }
  const listed = parts.map((part) => `- ${part.title}: "${part.spec}"`).join('\n');
  return `\n\nA grouping of the change by spec put these lines under:\n\n${listed}`;
}

function turnOf(turn: ReviewExplanation): string {
  const about = turn.subjects.length === 0 ? '' : `About ${subjectNames(turn)}.\n\n`;
  const answer = turn.result?.explanation ?? '(no answer: it did not finish)';
  return `### ${questionOf(turn)}\n\n${about}${answer}`;
}

/** The earlier turns, newest kept within the budget, oldest first. */
function historyOf(earlier: ReviewExplanation[]): string {
  const kept: string[] = [];
  let size = 0;
  for (const turn of earlier.toReversed()) {
    const text = turnOf(turn);
    if (kept.length === MAX_HISTORY_TURNS || size + text.length > MAX_HISTORY_CHARS) {
      break;
    }
    kept.unshift(text);
    size += text.length;
  }
  if (kept.length === 0) {
    return '';
  }
  const left = earlier.length - kept.length;
  const note = left > 0 ? `${left} earlier questions are left out.\n\n` : '';
  return `\n\n## Earlier in this conversation\n\n${note}${kept.join('\n\n')}`;
}

/** Said when the change moved since the turn before: the earlier answers read older code. */
function movedOf(turn: ReviewExplanation, before: ReviewExplanation | undefined): string {
  if (!before || before.headSha === turn.headSha) {
    return '';
  }
  return `\n\nThe change moved since the earlier answers: they read commit ${before.headSha}, it is now at ${turn.headSha} (HEAD). Check again what they said about code that changed.`;
}

function section(text: string): string {
  return text === '' ? '' : `\n\n${text}`;
}

/** Everything the agent needs, for a new conversation or a turn whose session is not resumed. */
export function explainPrompt(
  db: Db,
  target: ReviewTarget,
  thread: ReviewExplanation[],
  parts: SpecPart[],
): string {
  const turn = thread.at(-1);
  if (!turn) {
    throw new Error('An explanation thread is never empty');
  }
  const earlier = thread.slice(0, -1);
  return `${sharedPrompt(db, target.projectId)}

${resolveAgent(db, 'review_explain').prompt}

${specsOf(turn.specs)}

## The change

${target.about}

The change is checked out in the repository root, at HEAD. Read it with \`git diff ${target.base}...HEAD -- <path>\` and read any file you need. Run one git command per call: no \`&&\`, no \`cd\`. Do not change any file.${section(subjectsOf(target, turn))}${partsOf(parts)}${historyOf(earlier)}${movedOf(turn, earlier.at(-1))}

## The question

${questionOf(turn)}

## Your answer

${EXPLANATION_FORMAT}`;
}

/** The next turn, in the session that gave the earlier answers. */
export function followUpPrompt(
  target: ReviewTarget,
  turn: ReviewExplanation,
  before: ReviewExplanation,
  parts: SpecPart[],
): string {
  const specs =
    JSON.stringify(turn.specs) === JSON.stringify(before.specs)
      ? ''
      : `\n\nThe reviewer changed the specifications; read them again:\n\n${specsOf(turn.specs)}`;
  return `The next question in this conversation.${movedOf(turn, before)}${specs}${section(subjectsOf(target, turn))}${partsOf(parts)}

## The question

${questionOf(turn)}

${EXPLANATION_FORMAT}`;
}

/** The thread's last turn, the one asked, and the turn before it. */
export function lastTurns(thread: ReviewExplanation[]): {
  turn: ReviewExplanation | undefined;
  before: ReviewExplanation | undefined;
} {
  return { turn: thread.at(-1), before: thread.slice(0, -1).at(-1) };
}

/**
 * The session a turn resumes: a ticket's, from the answer just before it, while the conversation is
 * short. A pull request's container is new each time, and a longer conversation starts a fresh
 * session with the earlier turns as text, so a session does not grow without end. Null: run fresh.
 */
export function resumedSession(thread: ReviewExplanation[]): string | null {
  const { turn, before } = lastTurns(thread);
  if (!turn || turn.ticketId === null || before?.status !== 'succeeded') {
    return null;
  }
  return thread.length > MAX_RESUMED_TURNS ? null : before.sessionId;
}

// The prompts of an Explain: a fresh one with the specs, the change and the lines, and a follow-up's.
import {
  resolveAgent,
  sharedPrompt,
  type AgentReviewSpec,
  type Db,
  type ReviewExplanation,
  type SpecPart,
} from '@union/core';

import type { ReviewTarget } from './agent-review-target';

/** Appended by the host, never editable: the explanation is read from this block. */
export const EXPLANATION_FORMAT = `End your answer with one fenced \`json\` block, and nothing after it:

\`\`\`json
{"explanation": "Markdown: what the lines do and how, citing code as \`path:line\`.",
 "specs": [{"source": "the spec's name, exactly as given", "quote": "its words, copied exactly", "how": "how the lines implement it"}],
 "docs": [{"path": "docs/spec/export.md", "heading": "Limits", "why": "how it relates to the lines"}],
 "notInSpec": "only when no spec asks for these lines: why they are there anyway"}
\`\`\`

- \`explanation\`: a few short paragraphs at most.
- \`specs\`: only quotes copied word for word from the specifications above; leave it empty when none applies.
- \`docs\`: the repository's own documents the lines relate to, paths from the repository root.`;

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

function linesOf(target: ReviewTarget, explanation: ReviewExplanation): string {
  const { path, side, startLine, endLine, excerpt } = explanation;
  const where =
    side === 'new'
      ? `\`${path}\`, lines ${startLine}-${endLine} at HEAD`
      : `\`${path}\`, lines ${startLine}-${endLine} before the change (removed by it: \`git show ${target.base}:${path}\`)`;
  return `## The lines\n\n${where}:\n\n\`\`\`\n${excerpt}\n\`\`\``;
}

function questionOf(explanation: ReviewExplanation): string {
  return explanation.question ?? 'Explain how these lines work, and why the change has them.';
}

/** The earlier questions and answers of a thread, for a follow-up that runs in a fresh session. */
function threadOf(earlier: ReviewExplanation[]): string {
  if (earlier.length === 0) {
    return '';
  }
  const turns = earlier.map(
    (turn) =>
      `### ${questionOf(turn)}\n\n${turn.result?.explanation ?? '(no answer: it did not finish)'}`,
  );
  return `\n\n## Earlier in this thread\n\n${turns.join('\n\n')}`;
}

/** Everything the agent needs, for a first question or a follow-up whose session is gone. */
export function explainPrompt(
  db: Db,
  target: ReviewTarget,
  thread: ReviewExplanation[],
  parts: SpecPart[],
): string {
  const explanation = thread.at(-1);
  if (!explanation) {
    throw new Error('An explanation thread is never empty');
  }
  return `${sharedPrompt(db, target.projectId)}

${resolveAgent(db, 'review_explain').prompt}

${specsOf(explanation.specs)}

## The change

${target.about}

The change is checked out in the repository root, at HEAD. Read it with \`git diff ${target.base}...HEAD -- <path>\` and read any file you need. Run one git command per call: no \`&&\`, no \`cd\`. Do not change any file.

${linesOf(target, explanation)}${partsOf(parts)}${threadOf(thread.slice(0, -1))}

## The question

${questionOf(explanation)}

## Your answer

${EXPLANATION_FORMAT}`;
}

/** A follow-up in the session that gave the earlier answers. */
export function followUpPrompt(explanation: ReviewExplanation): string {
  return `A follow-up question on the same lines:

${questionOf(explanation)}

${EXPLANATION_FORMAT}`;
}

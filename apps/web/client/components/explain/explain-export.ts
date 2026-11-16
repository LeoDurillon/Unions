// An Explain conversation as a Markdown file: its title, then each question, its subjects and its answer, oldest first.

import type { ExplanationResult } from '@union/core';
import { subjectLabel } from '@union/core/explain-subjects';

import type {
  ConversationView,
  ExplanationView,
} from '../../../src/routes/review/explanation-views';

const MAX_NAME = 60;

function answerOf(result: ExplanationResult): string {
  const specs = result.specs.map(
    (spec) => `> ${spec.quote}\n\n— ${spec.source}${spec.how ? `: ${spec.how}` : ''}`,
  );
  const docs = result.docs.map(
    (doc) =>
      `- \`${doc.path}\`${doc.heading ? ` § ${doc.heading}` : ''}${doc.why ? `: ${doc.why}` : ''}`,
  );
  const parts = [result.explanation];
  if (specs.length > 0) {
    parts.push(`#### Specs\n\n${specs.join('\n\n')}`);
  } else if (result.notInSpec) {
    parts.push(`#### Not in the spec\n\n${result.notInSpec}`);
  }
  if (docs.length > 0) {
    parts.push(`#### Docs\n\n${docs.join('\n')}`);
  }
  return parts.join('\n\n');
}

function turnOf(turn: ExplanationView, index: number): string {
  const about =
    turn.subjects.length === 0
      ? ''
      : `About ${turn.subjects.map((subject) => `\`${subjectLabel(subject)}\``).join(', ')}.\n\n`;
  const question = turn.question ? `> ${turn.question.split('\n').join('\n> ')}\n\n` : '';
  const answer = turn.result ? answerOf(turn.result) : `_No answer (${turn.status})._`;
  return `## Question ${index + 1}\n\n${about}${question}${answer}`;
}

export function conversationMarkdown(conversation: ConversationView): string {
  const turns = conversation.turns.map((turn, index) => turnOf(turn, index));
  return `# ${conversation.title}\n\n${turns.join('\n\n')}\n`;
}

/** `explain-why-page-the-list.md`. */
export function conversationFileName(conversation: ConversationView): string {
  const slug = conversation.title
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, '-')
    .replaceAll(/^-|-$/gu, '')
    .slice(0, MAX_NAME);
  return `explain-${slug || conversation.id}.md`;
}

// Tests exporting an Explain conversation as Markdown, and its file name.

import { expect, test } from 'bun:test';

import type {
  ConversationView,
  ExplanationView,
} from '../../../src/routes/review/explanation-views';
import { conversationFileName, conversationMarkdown } from './explain-export';

function turn(extra: Partial<ExplanationView>): ExplanationView {
  return {
    id: 1,
    conversationId: 1,
    subjects: [],
    question: null,
    headSha: 'h',
    status: 'succeeded',
    result: null,
    error: null,
    createdAt: 1,
    startedAt: null,
    finishedAt: null,
    specs: [],
    outdated: false,
    specParts: [],
    partsOutdated: false,
    ...extra,
  };
}

const CONVERSATION: ConversationView = {
  id: 7,
  title: 'Why page the list?',
  createdAt: 1,
  updatedAt: 2,
  turns: [
    turn({
      subjects: [
        { kind: 'lines', path: 'a.ts', side: 'new', start: 3, end: 5, excerpt: 'x' },
        { kind: 'change' },
      ],
      result: {
        explanation: 'It pages.',
        specs: [{ source: 'Ticket', quote: 'Page it', how: 'here' }],
        docs: [{ path: 'docs/x.md', heading: 'Limits', why: 'says so' }],
        notInSpec: null,
        dropped: 0,
      },
    }),
    turn({ id: 2, question: 'And then?\nReally?', status: 'failed' }),
  ],
};

test('each question comes with what it was about and its answer, oldest first', () => {
  expect(conversationMarkdown(CONVERSATION)).toBe(`# Why page the list?

## Question 1

About \`a.ts:3-5\`, \`The whole change\`.

It pages.

#### Specs

> Page it

— Ticket: here

#### Docs

- \`docs/x.md\` § Limits: says so

## Question 2

> And then?
> Really?

_No answer (failed)._
`);
});

test('the file is named after the title', () => {
  expect(conversationFileName(CONVERSATION)).toBe('explain-why-page-the-list.md');
  expect(conversationFileName({ ...CONVERSATION, title: '???' })).toBe('explain-7.md');
});

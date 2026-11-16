// Tests which lines of a file the Explain conversations mark: their current answers' lines, each conversation once.

import { expect, test } from 'bun:test';

import type {
  ConversationView,
  ExplanationView,
} from '../../../src/routes/review/explanation-views';
import { askedRanges, markOf } from './explain-line-marks';

function turn(start: number, end: number, extra: Partial<ExplanationView> = {}): ExplanationView {
  return {
    id: start,
    conversationId: 1,
    subjects: [
      { kind: 'lines', path: 'a.ts', side: 'new', start, end, excerpt: '' },
      { kind: 'file', path: 'a.ts' },
    ],
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

const CONVERSATIONS: ConversationView[] = [
  { id: 2, title: 'Newer', createdAt: 2, updatedAt: 2, turns: [turn(4, 6)] },
  {
    id: 1,
    title: 'Older',
    createdAt: 1,
    updatedAt: 1,
    turns: [turn(1, 5), turn(20, 22, { outdated: true }), turn(3, 3)],
  },
];

const open = (): void => {
  // The marks only carry it.
};

test("the current answers' lines of the file are asked about; outdated ones and other files are not", () => {
  expect(askedRanges(CONVERSATIONS, 'a.ts').map(({ id, start, end }) => [id, start, end])).toEqual([
    [2, 4, 6],
    [1, 1, 5],
    [1, 3, 3],
  ]);
  expect(askedRanges(CONVERSATIONS, 'b.ts')).toEqual([]);
});

test('a line lists each conversation asking about it once, newest first, and says where a range starts', () => {
  const asked = askedRanges(CONVERSATIONS, 'a.ts');
  expect(markOf(asked, 'new', 3, open)).toMatchObject({
    conversations: [{ id: 1, title: 'Older' }],
    first: true,
  });
  expect(markOf(asked, 'new', 5, open)).toMatchObject({
    conversations: [
      { id: 2, title: 'Newer' },
      { id: 1, title: 'Older' },
    ],
    first: false,
  });
  expect(markOf(asked, 'old', 3, open)).toBeNull();
  expect(markOf(asked, 'new', 21, open)).toBeNull();
});

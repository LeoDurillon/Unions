// Tests the Explain prompts: each kind of subject, the conversation so far within its budget, a moved change, resuming.

import { beforeAll, expect, test } from 'bun:test';

import { createDb, migrateDb, schema, type Db, type ReviewExplanation } from '@union/core';

import type { ReviewTarget } from './agent-review-target';
import { explainPrompt, followUpPrompt, resumedSession } from './review-explain-prompt';

const PATCH = '@@ -1,2 +1,2 @@\n const a = 1;\n-const b = 2;\n+const b = 3;';
const RESULT = { explanation: 'Sets b.', specs: [], docs: [], notInSpec: null, dropped: 0 };

let db: Db;
let target: ReviewTarget;

beforeAll(() => {
  db = createDb(':memory:');
  migrateDb(db);
  const projectId = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  target = {
    container: 'c',
    projectId,
    base: 'origin/main',
    headSha: 'h1',
    patchOf: (path) => (path === 'a.ts' || path === 'b.ts' ? PATCH : undefined),
    paths: ['a.ts', 'b.ts'],
    about: 'Ticket #1',
    brief: 'Ticket #1',
    log: () => {
      // The prompts never log.
    },
    close: () => Promise.resolve(),
  };
});

function turn(id: number, extra: Partial<ReviewExplanation> = {}): ReviewExplanation {
  return {
    id,
    ticketId: 1,
    reviewId: null,
    conversationId: 1,
    subjects: [],
    question: `Question ${id}?`,
    specs: [],
    headSha: 'h1',
    status: 'succeeded',
    result: { ...RESULT, explanation: `Answer ${id}.` },
    sessionId: `s${id}`,
    error: null,
    createdAt: id,
    startedAt: null,
    finishedAt: null,
    ...extra,
  };
}

test('lines, a file and the whole change are each described, with a question for them', () => {
  const asked = turn(1, {
    question: null,
    subjects: [
      { kind: 'lines', path: 'a.ts', side: 'old', start: 2, end: 2, excerpt: 'const b = 2;' },
      { kind: 'file', path: 'b.ts' },
      { kind: 'change' },
    ],
  });
  const prompt = explainPrompt(db, target, [asked], []);
  expect(prompt).toContain('## What it is about, each part');
  expect(prompt).toContain('before the change (removed by it: `git show origin/main:a.ts`)');
  expect(prompt).toContain(
    'The file `b.ts` (+1 −1): read its diff with `git diff origin/main...HEAD -- b.ts`',
  );
  expect(prompt).toContain('The whole change, 2 files:\n\n- `a.ts` (+1 −1)\n- `b.ts` (+1 −1)');
  expect(prompt).toContain('## The question\n\nExplain how these work together');
  expect(
    explainPrompt(db, target, [turn(2, { question: null, subjects: [{ kind: 'change' }] })], []),
  ).toContain('Explain how the change works, its main path first');
});

test('a fresh prompt carries the newest earlier turns, and says when the change moved', () => {
  const thread = [
    ...Array.from({ length: 8 }, (_, index) => turn(index + 1)),
    turn(9, { headSha: 'h2' }),
  ];
  const prompt = explainPrompt(db, target, thread, []);
  expect(prompt).toContain('## Earlier in this conversation\n\n2 earlier questions are left out.');
  expect(prompt).not.toContain('Answer 2.');
  expect(prompt).toContain('### Question 3?\n\nAnswer 3.');
  expect(prompt).toContain('they read commit h1, it is now at h2');
  expect(prompt).toEndWith(prompt.slice(prompt.indexOf('End your answer')));
  const long = turn(1, { result: { ...RESULT, explanation: 'x'.repeat(25_000) } });
  expect(explainPrompt(db, target, [long, turn(2)], [])).not.toContain(
    'Earlier in this conversation',
  );
});

test('a resumed turn gets only its subjects and question, and the specs when they changed', () => {
  const spec = { kind: 'pr' as const, label: 'PR', text: 'B is 3.', prs: [] };
  const lines = {
    kind: 'lines' as const,
    path: 'a.ts',
    side: 'new' as const,
    start: 2,
    end: 2,
    excerpt: 'b',
  };
  const before = turn(1);
  const next = turn(2, { subjects: [lines], specs: [spec] });
  const prompt = followUpPrompt(target, next, before, [
    { key: 'k', title: 'Paging', spec: 'Page it.' },
  ]);
  expect(prompt).toStartWith('The next question in this conversation.');
  expect(prompt).toContain('The reviewer changed the specifications; read them again');
  expect(prompt).toContain('`a.ts`, lines 2-2 at HEAD');
  expect(prompt).toContain('- Paging: "Page it."');
  expect(followUpPrompt(target, turn(2), before, [])).not.toContain('changed the specifications');
});

test("a ticket's short conversation resumes the answer before; others run fresh", () => {
  expect(resumedSession([turn(1)])).toBeNull();
  expect(resumedSession([turn(1), turn(2)])).toBe('s1');
  expect(resumedSession([turn(1, { status: 'failed' }), turn(2)])).toBeNull();
  expect(resumedSession([turn(1, { ticketId: null }), turn(2, { ticketId: null })])).toBeNull();
  const long = Array.from({ length: 9 }, (_, index) => turn(index + 1));
  expect(resumedSession(long)).toBeNull();
});

import { expect, test } from 'bun:test';

import { commentPageOf } from './jira-comments';

const SITE = 'https://acme.atlassian.net';

const doc = (...content: unknown[]): unknown => ({ type: 'doc', version: 1, content });
const paragraph = (...content: unknown[]): unknown => ({ type: 'paragraph', content });

function comment(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    author: { accountId: '557058:ada', displayName: 'Ada Lovelace' },
    body: doc(paragraph({ type: 'text', text: `Comment ${id}` })),
    created: '2026-11-07T09:00:00.000+0100',
    updated: '2026-11-07T09:00:00.000+0100',
    ...extra,
  };
}

test("a comment's author, times, text and link", () => {
  const body = doc(
    paragraph(
      { type: 'mention', attrs: { id: '557058:bob', text: '@Bob' } },
      { type: 'text', text: ' is it CSV or ' },
      { type: 'text', text: 'XLSX', marks: [{ type: 'code' }] },
      { type: 'text', text: '?' },
    ),
    {
      type: 'mediaSingle',
      content: [{ type: 'media', attrs: { id: 'm1', alt: 'mock.png', type: 'file' } }],
    },
  );
  const page = commentPageOf(
    { total: 1, comments: [comment('10010', { body, updated: '2026-11-07T10:30:00.000+0100' })] },
    SITE,
    'ABC-1',
  );
  expect(page).toEqual({
    total: 1,
    comments: [
      {
        id: '10010',
        author: 'Ada Lovelace',
        accountId: '557058:ada',
        created: '2026-11-07T09:00:00.000+0100',
        updated: '2026-11-07T10:30:00.000+0100',
        edited: true,
        restriction: null,
        markdown: '@Bob is it CSV or `XLSX`?\n\n*mock.png*',
        url: `${SITE}/browse/ABC-1?focusedCommentId=10010`,
      },
    ],
  });
});

test('restricted and internal comments say who may see them', () => {
  const page = commentPageOf(
    {
      comments: [
        comment('1', {
          visibility: { type: 'role', value: 'Developers', identifier: 'Developers' },
        }),
        comment('2', { jsdPublic: false }),
        comment('3', { jsdPublic: true }),
      ],
    },
    SITE,
    'ABC-1',
  );
  expect(page.comments.map((each) => each.restriction)).toEqual([
    'Visible to Developers',
    'Internal',
    null,
  ]);
  expect(page.total).toBe(3);
});

test('an app or anonymized author has no account to mention; anything else is no comment', () => {
  const page = commentPageOf(
    { comments: [comment('1', { author: {} }), { body: 'no id' }, 'x'] },
    SITE,
    'ABC-1',
  );
  expect(page.comments).toMatchObject([
    { id: '1', author: 'Someone', accountId: null, edited: false },
  ]);
  expect(commentPageOf(null, SITE, 'ABC-1')).toEqual({ comments: [], total: 0 });
});

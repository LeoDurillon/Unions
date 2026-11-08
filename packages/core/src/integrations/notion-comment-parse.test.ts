import { expect, test } from 'bun:test';

import { commentOf, commentsOf } from './notion-comment-parse';

const PAGE = '11111111-2222-4333-8444-555555555555';
const BLOCK = '22222222-2222-4333-8444-555555555555';

const ANNOTATIONS = {
  bold: false,
  italic: false,
  strikethrough: false,
  underline: false,
  code: false,
  color: 'default',
};

/** A comment as `GET /v1/comments` returned it on a real page (ids, names and text replaced). */
const RAW = {
  object: 'comment',
  id: '33333333-2222-4333-8444-555555555555',
  parent: { type: 'page_id', page_id: PAGE },
  discussion_id: '44444444-2222-4333-8444-555555555555',
  created_time: '2025-11-13T09:39:00.000Z',
  last_edited_time: '2025-11-13T09:39:00.000Z',
  created_by: { object: 'user', id: '55555555-2222-4333-8444-555555555555' },
  rich_text: [
    {
      type: 'mention',
      mention: { type: 'user', user: { object: 'user', id: 'x', name: 'Ada Lovelace' } },
      annotations: ANNOTATIONS,
      plain_text: '@Ada Lovelace',
      href: null,
    },
    {
      type: 'text',
      text: { content: ' is this really a P2?', link: null },
      annotations: { ...ANNOTATIONS, bold: true },
      plain_text: ' is this really a P2?',
      href: null,
    },
  ],
  display_name: { type: 'user', resolved_name: 'Grace' },
  original_content_deleted: false,
  has_pending_attachments: false,
};

test('a page comment: its thread, author, time and text runs', () => {
  expect(commentOf(RAW)).toEqual({
    id: RAW.id,
    discussionId: RAW.discussion_id,
    blockId: null,
    author: 'Grace',
    createdAt: '2025-11-13T09:39:00.000Z',
    richText: [
      {
        text: '@Ada Lovelace',
        href: null,
        bold: false,
        italic: false,
        strikethrough: false,
        code: false,
      },
      {
        text: ' is this really a P2?',
        href: null,
        bold: true,
        italic: false,
        strikethrough: false,
        code: false,
      },
    ],
  });
});

test('a comment on a block keeps the block; one without a name has an empty author', () => {
  const { display_name: _name, ...unnamed } = RAW;
  const comment = commentOf({ ...unnamed, parent: { type: 'block_id', block_id: BLOCK } });
  expect(comment?.blockId).toBe(BLOCK);
  expect(comment?.author).toBe('');
});

test('a list skips what is not a comment', () => {
  expect(commentsOf([RAW, { id: 'x' }, null, 'text']).map((comment) => comment.id)).toEqual([
    RAW.id,
  ]);
  expect(commentsOf(null)).toEqual([]);
});

import { expect, test } from 'bun:test';

import { notionCommentOf, notionCommentProblem } from './notion-comment-post';
import { toRichText } from './notion-rich-text';

function shape(text: string): [string, string | null, boolean, boolean][] {
  return toRichText(text).map((item) =>
    item.type === 'mention'
      ? [`@${item.mention.user.id}`, null, false, false]
      : [
          item.text.content,
          item.text.link?.url ?? null,
          item.annotations.bold,
          item.annotations.code,
        ],
  );
}

test('a mention token becomes a user mention, in its place among the text', () => {
  expect(toRichText('Hi [@Ada Lovelace](mention:3f2a-1), **look**')).toEqual([
    {
      type: 'text',
      text: { content: 'Hi ', link: null },
      annotations: { bold: false, code: false },
    },
    { type: 'mention', mention: { type: 'user', user: { id: '3f2a-1' } } },
    {
      type: 'text',
      text: { content: ', ', link: null },
      annotations: { bold: false, code: false },
    },
    {
      type: 'text',
      text: { content: 'look', link: null },
      annotations: { bold: true, code: false },
    },
  ]);
  expect(shape('[@Ada](https://x.y)')).toEqual([['@Ada', 'https://x.y', false, false]]);
});

test('links, bold and code become marks; the rest, line breaks included, stays as typed', () => {
  expect(
    shape(
      'Fixed in **#42**, see [the PR](https://github.com/a/b/pull/42)\nand `exportCsv()` *now*',
    ),
  ).toEqual([
    ['Fixed in ', null, false, false],
    ['#42', null, true, false],
    [', see ', null, false, false],
    ['the PR', 'https://github.com/a/b/pull/42', false, false],
    ['\nand ', null, false, false],
    ['exportCsv()', null, false, true],
    [' *now*', null, false, false],
  ]);
});

test('a link without http stays literal', () => {
  expect(shape('[x](javascript:alert)')).toEqual([['[x](javascript:alert)', null, false, false]]);
});

test('a run longer than Notion takes is split at 2000 characters', () => {
  const parts = shape('a'.repeat(4500)).map(([content]) => content.length);
  expect(parts).toEqual([2000, 2000, 500]);
});

test('the text is refused empty, too long, or with too many marks', () => {
  expect(notionCommentProblem('  ')).toBe('Write a comment first');
  expect(notionCommentProblem('a'.repeat(4001))).toContain('4,000');
  expect(notionCommentProblem('**b** '.repeat(60))).toContain('links and marks');
  expect(notionCommentProblem('Looks good')).toBeNull();
});

test('the payload is read back, a missing discussion meaning a page comment', () => {
  expect(
    notionCommentOf({ projectId: 1, ticketId: 2, pageId: 'p', discussionId: '', text: ' Hi ' }),
  ).toEqual({ projectId: 1, ticketId: 2, pageId: 'p', discussionId: null, text: 'Hi' });
  expect(() => notionCommentOf({ projectId: 1, ticketId: 2, text: 'Hi' })).toThrow('pageId');
});

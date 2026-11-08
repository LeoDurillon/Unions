import { expect, test } from 'bun:test';

import { notionCommentOf, notionCommentProblem } from './notion-comment-post';
import { toRichText } from './notion-rich-text';

function shape(text: string): [string, string | null, boolean, boolean][] {
  return toRichText(text).map((item) => [
    item.text.content,
    item.text.link?.url ?? null,
    item.annotations.bold,
    item.annotations.code,
  ]);
}

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
  const parts = toRichText('a'.repeat(4500)).map((item) => item.text.content.length);
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

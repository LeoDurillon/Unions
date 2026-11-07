import { expect, test } from 'bun:test';

import { withLeadingMention } from './adf-mention';
import { markdownAdf } from './markdown-adf';

const ADA = { accountId: '557058:ada', name: 'Ada' };
const MENTION = { type: 'mention', attrs: { id: '557058:ada', text: '@Ada' } };

/** The reply's blocks, as plain data compared with the literals below. */
function reply(markdown: string): unknown {
  return withLeadingMention(markdownAdf(markdown), ADA).content;
}

test('a reply starting with a paragraph has the mention at its start', () => {
  expect(reply('The fix is in `auth.ts`.')).toEqual([
    {
      type: 'paragraph',
      content: [
        MENTION,
        { type: 'text', text: ' ' },
        { type: 'text', text: 'The fix is in ' },
        { type: 'text', text: 'auth.ts', marks: [{ type: 'code' }] },
        { type: 'text', text: '.' },
      ],
    },
  ]);
});

test('a reply starting with a list or code has a paragraph with the mention first', () => {
  expect(reply('- one\n- two')).toMatchObject([
    { type: 'paragraph', content: [MENTION] },
    { type: 'bulletList' },
  ]);
  expect(reply('```\nx\n```')).toMatchObject([
    { type: 'paragraph', content: [MENTION] },
    { type: 'codeBlock' },
  ]);
  expect(reply('')).toEqual([{ type: 'paragraph', content: [MENTION] }]);
});

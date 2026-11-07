import { expect, test } from 'bun:test';

import { textAdf } from './text-adf';

/** The document as plain data: compared with the literals below. */
function adf(value: string): unknown {
  return textAdf(value);
}

/** The first paragraph's inline content. */
function firstParagraph(value: string): unknown {
  return textAdf(value).content[0]?.content;
}

const text = (value: string): Record<string, unknown> => ({ type: 'text', text: value });
const link = (href: string): Record<string, unknown> => ({
  type: 'text',
  text: href,
  marks: [{ type: 'link', attrs: { href } }],
});

test('blank lines make paragraphs, single newlines line breaks', () => {
  expect(adf('Ready for QA.\nPlease look.\n\n\nThanks')).toEqual({
    type: 'doc',
    version: 1,
    content: [
      {
        type: 'paragraph',
        content: [text('Ready for QA.'), { type: 'hardBreak' }, text('Please look.')],
      },
      { type: 'paragraph', content: [text('Thanks')] },
    ],
  });
});

test('links are linked text, without the punctuation that ends the sentence', () => {
  const url = 'https://github.com/acme/shop/pull/12';
  expect(firstParagraph(`PR: ${url}. (see ${url})`)).toEqual([
    text('PR: '),
    link(url),
    text('. (see '),
    link(url),
    text(')'),
  ]);
});

test('an empty text is an empty document; markdown stays as typed', () => {
  expect(adf('  \n\n ')).toEqual({ type: 'doc', version: 1, content: [] });
  expect(firstParagraph('**bold**')).toEqual([text('**bold**')]);
});

test('a reply starts with a mention of the author, then the text', () => {
  expect(firstParagraph('Done, see the PR.')).toEqual([text('Done, see the PR.')]);
  expect(
    textAdf('Done.\n\nThanks', { accountId: '557058:ada', name: 'Ada' }).content.map(
      (paragraph) => paragraph.content.length,
    ),
  ).toEqual([3, 1]);
  expect(textAdf('Done.', { accountId: '557058:ada', name: 'Ada' }).content[0]?.content[0]).toEqual(
    {
      type: 'mention',
      attrs: { id: '557058:ada', text: '@Ada' },
    },
  );
});

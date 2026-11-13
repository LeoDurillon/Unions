import { expect, test } from 'bun:test';

import { adfMarkdown } from './adf-markdown';
import { markdownAdf } from './markdown-adf';

/** The document's blocks, as plain data compared with the literals below. */
function blocks(markdown: string): unknown {
  return markdownAdf(markdown).content;
}

const text = (value: string, ...marks: unknown[]): unknown =>
  marks.length === 0 ? { type: 'text', text: value } : { type: 'text', text: value, marks };
const paragraph = (...content: unknown[]): unknown => ({ type: 'paragraph', content });

test('text keeps its marks; code takes no mark but a link', () => {
  expect(
    blocks('Make it **fast**, *safe*, ~~old~~ and `bun test`; see [the *docs*](https://x.y/docs).'),
  ).toEqual([
    paragraph(
      text('Make it '),
      text('fast', { type: 'strong' }),
      text(', '),
      text('safe', { type: 'em' }),
      text(', '),
      text('old', { type: 'strike' }),
      text(' and '),
      text('bun test', { type: 'code' }),
      text('; see '),
      text('the ', { type: 'link', attrs: { href: 'https://x.y/docs' } }),
      text('docs', { type: 'link', attrs: { href: 'https://x.y/docs' } }, { type: 'em' }),
      text('.'),
    ),
  ]);
  expect(blocks('**`x`** and [`y`](https://x.y)')).toEqual([
    paragraph(
      text('x', { type: 'code' }),
      text(' and '),
      text('y', { type: 'link', attrs: { href: 'https://x.y' } }, { type: 'code' }),
    ),
  ]);
});

test('a soft line break is a space, a hard one a break', () => {
  expect(blocks('one\ntwo\\\nthree')).toEqual([
    paragraph(text('one two'), { type: 'hardBreak' }, text('three')),
  ]);
});

test('headings, rules and code blocks', () => {
  expect(blocks('# Title\n\n###### Small\n\n---\n\n```ts\nconst a = 1;\n```\n\n```\n```')).toEqual([
    { type: 'heading', attrs: { level: 1 }, content: [text('Title')] },
    { type: 'heading', attrs: { level: 6 }, content: [text('Small')] },
    { type: 'rule' },
    { type: 'codeBlock', attrs: { language: 'ts' }, content: [text('const a = 1;')] },
    { type: 'codeBlock', content: [] },
  ]);
});

test('lists nest, numbers keep their start', () => {
  // A list starting at 3 cannot interrupt a paragraph (CommonMark): a blank line first.
  expect(blocks('- one\n\n  3. three\n  4. four\n- two')).toEqual([
    {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [
            paragraph(text('one')),
            {
              type: 'orderedList',
              attrs: { order: 3 },
              content: [
                { type: 'listItem', content: [paragraph(text('three'))] },
                { type: 'listItem', content: [paragraph(text('four'))] },
              ],
            },
          ],
        },
        { type: 'listItem', content: [paragraph(text('two'))] },
      ],
    },
  ]);
});

test('a list where every item has a box is a task list, nested ones included', () => {
  expect(blocks('- [ ] write\n- [x] ship\n  - [ ] tell')).toEqual([
    {
      type: 'taskList',
      attrs: { localId: 'union-1' },
      content: [
        {
          type: 'taskItem',
          attrs: { localId: 'union-2', state: 'TODO' },
          content: [text('write')],
        },
        { type: 'taskItem', attrs: { localId: 'union-3', state: 'DONE' }, content: [text('ship')] },
        {
          type: 'taskList',
          attrs: { localId: 'union-4' },
          content: [
            {
              type: 'taskItem',
              attrs: { localId: 'union-5', state: 'TODO' },
              content: [text('tell')],
            },
          ],
        },
      ],
    },
  ]);
});

test('a quote keeps paragraphs and lists; a heading in it becomes its text', () => {
  expect(blocks('> ## Seen\n> on staging\n>\n> - twice')).toEqual([
    {
      type: 'blockquote',
      content: [
        paragraph(text('Seen')),
        paragraph(text('on staging')),
        {
          type: 'bulletList',
          content: [{ type: 'listItem', content: [paragraph(text('twice'))] }],
        },
      ],
    },
  ]);
});

test('a table: its first row is the header', () => {
  const cell = (type: string, value: string): unknown => ({
    type,
    content: [paragraph(text(value))],
  });
  expect(blocks('| Field | Kept |\n| --- | :-: |\n| name | **no** |')).toEqual([
    {
      type: 'table',
      content: [
        { type: 'tableRow', content: [cell('tableHeader', 'Field'), cell('tableHeader', 'Kept')] },
        {
          type: 'tableRow',
          content: [
            cell('tableCell', 'name'),
            { type: 'tableCell', content: [paragraph(text('no', { type: 'strong' }))] },
          ],
        },
      ],
    },
  ]);
});

test('references, images and HTML become links and text', () => {
  expect(
    blocks(
      'See [the spec][spec] and ![mock](https://x.y/m.png) <b>now</b>.\n\n[spec]: https://x.y/spec\n\n<div>Note</div>',
    ),
  ).toEqual([
    paragraph(
      text('See '),
      text('the spec', { type: 'link', attrs: { href: 'https://x.y/spec' } }),
      text(' and '),
      text('mock', { type: 'link', attrs: { href: 'https://x.y/m.png' } }),
      text(' '),
      text('now'),
      text('.'),
    ),
    paragraph(text('Note')),
  ]);
});

test('an empty text is an empty document', () => {
  expect(markdownAdf('  \n')).toEqual({ type: 'doc', version: 1, content: [] });
});

test("an agent's draft comes back the same through the import's converter", () => {
  const draft = [
    '## Problem',
    'The export drops **accented** names and *some* rows.',
    '## Steps',
    '1. Open the export\n2. Pick `CSV`',
    '## Done when',
    '- [ ] Names keep their accents\n- [x] Rows are all there',
    '> Seen on staging.',
    '| Field | Kept |\n| --- | --- |\n| name | no |',
    '```ts\nconst a = 1;\n```',
    'See [the issue](https://example.com/1).',
  ].join('\n\n');
  expect(adfMarkdown(markdownAdf(draft))).toBe(draft);
});

test('a mention token is a mention of the account, read back as @Name', () => {
  const markdown = 'Ping [@Ada Lovelace](mention:557058:ada-1) about **this**';
  const mention = { type: 'mention', attrs: { id: '557058:ada-1', text: '@Ada Lovelace' } };
  expect(blocks(markdown)).toEqual([
    paragraph(text('Ping '), mention, text(' about '), text('this', { type: 'strong' })),
  ]);
  expect(adfMarkdown(markdownAdf(markdown))).toContain('@Ada Lovelace');
});

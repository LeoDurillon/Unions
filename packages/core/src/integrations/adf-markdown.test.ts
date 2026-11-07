import { expect, test } from 'bun:test';

import { adfMarkdown } from './adf-markdown';

type Node = Record<string, unknown>;

const doc = (...content: Node[]): Node => ({ type: 'doc', version: 1, content });
const text = (value: string, ...marks: Node[]): Node => ({ type: 'text', text: value, marks });
const p = (...content: Node[]): Node => ({ type: 'paragraph', content });
const li = (...content: Node[]): Node => ({ type: 'listItem', content });
const block = (code: string, language?: string): Node => ({
  type: 'codeBlock',
  attrs: language ? { language } : {},
  content: [{ type: 'text', text: code }],
});
const media = (id: string, alt: string): Node => ({
  type: 'mediaSingle',
  content: [{ type: 'media', attrs: { id, alt, type: 'file', collection: '' } }],
});

test('paragraphs, headings and marks', () => {
  const markdown = adfMarkdown(
    doc(
      { type: 'heading', attrs: { level: 2 }, content: [text('Context')] },
      p(
        text('Make it '),
        text('fast ', { type: 'strong' }),
        text('and '),
        text('safe', { type: 'em' }),
        text(', see '),
        text('the docs', { type: 'link', attrs: { href: 'https://example.com/docs' } }),
        text(' and run '),
        text('bun test', { type: 'code' }),
        text(' or '),
        text('old', { type: 'strike' }, { type: 'underline' }),
      ),
    ),
  );
  expect(markdown).toBe(
    '## Context\n\nMake it **fast** and *safe*, see [the docs](https://example.com/docs) and run `bun test` or ~~old~~',
  );
});

test('markdown characters in text are escaped, except inside words and code', () => {
  const markdown = adfMarkdown(
    doc(p(text('a *b* [c] <d> snake_case _e_ '), text('*x*', { type: 'code' }))),
  );
  expect(markdown).toBe(String.raw`a \*b\* \[c\] \<d\> snake_case \_e\_ ${'`*x*`'}`);
});

test('adjacent text with the same marks is merged', () => {
  const bold = { type: 'strong' };
  expect(adfMarkdown(doc(p(text('a', bold), text('b', bold))))).toBe('**ab**');
});

test('inline nodes: mentions, emoji, dates, status, cards and breaks', () => {
  const markdown = adfMarkdown(
    doc(
      p(
        { type: 'mention', attrs: { id: '557058:1', text: '@Ada Lovelace' } },
        text(' '),
        { type: 'emoji', attrs: { shortName: ':smile:', text: '😄' } },
        text(' due '),
        { type: 'date', attrs: { timestamp: '1767225600000' } },
        text(' '),
        { type: 'status', attrs: { text: 'IN REVIEW', color: 'blue' } },
        { type: 'hardBreak' },
        { type: 'inlineCard', attrs: { url: 'https://acme.atlassian.net/browse/ABC-1' } },
      ),
    ),
  );
  expect(markdown).toBe(
    '@Ada Lovelace 😄 due 2026-01-01 \\[IN REVIEW\\]\\\n<https://acme.atlassian.net/browse/ABC-1>',
  );
});

test('bullet, ordered and nested lists', () => {
  const markdown = adfMarkdown(
    doc(
      {
        type: 'bulletList',
        content: [
          li(p(text('one')), {
            type: 'orderedList',
            attrs: { order: 3 },
            content: [li(p(text('three')))],
          }),
          li(p(text('two'))),
        ],
      },
      {
        type: 'orderedList',
        content: Array.from({ length: 10 }, (_, index) => li(p(text(`item ${index + 1}`)))),
      },
    ),
  );
  expect(markdown).toBe(
    [
      '- one',
      '  3. three',
      '- two',
      '',
      ...Array.from({ length: 10 }, (_, index) => `${index + 1}. item ${index + 1}`),
    ].join('\n'),
  );
});

test('a list item with several paragraphs keeps them apart', () => {
  const markdown = adfMarkdown(
    doc({ type: 'bulletList', content: [li(p(text('first')), p(text('second')))] }),
  );
  expect(markdown).toBe('- first\n\n  second');
});

test('task and decision lists', () => {
  const task = (state: string, value: string): Node => ({
    type: 'taskItem',
    attrs: { localId: value, state },
    content: [text(value)],
  });
  const markdown = adfMarkdown(
    doc(
      {
        type: 'taskList',
        content: [
          task('DONE', 'write'),
          task('TODO', 'ship'),
          { type: 'taskList', content: [task('TODO', 'tell')] },
        ],
      },
      {
        type: 'decisionList',
        content: [
          { type: 'decisionItem', attrs: { state: 'DECIDED' }, content: [text('Cloud only')] },
        ],
      },
    ),
  );
  expect(markdown).toBe('- [x] write\n- [ ] ship\n  - [ ] tell\n\n- Decision: Cloud only');
});

test('code blocks keep their text and language, fenced past their backticks', () => {
  expect(adfMarkdown(doc(block('const a = 1;\n*b*', 'ts')))).toBe('```ts\nconst a = 1;\n*b*\n```');
  expect(adfMarkdown(doc(block('```\nx\n```')))).toBe('````\n```\nx\n```\n````');
});

test('quotes, panels, rules and expands', () => {
  const markdown = adfMarkdown(
    doc(
      { type: 'blockquote', content: [p(text('quoted')), p(text('again'))] },
      { type: 'panel', attrs: { panelType: 'warning' }, content: [p(text('careful'))] },
      { type: 'rule' },
      { type: 'expand', attrs: { title: 'Details' }, content: [p(text('hidden'))] },
    ),
  );
  expect(markdown).toBe(
    '> quoted\n>\n> again\n\n> [!WARNING]\n> careful\n\n---\n\n**Details**\n\nhidden',
  );
});

test('tables: the first row is the header, cells on one line, spans and short rows padded', () => {
  const cell = (type: string, value: string, attrs: Node = {}): Node => ({
    type,
    attrs,
    content: [p(text(value))],
  });
  const markdown = adfMarkdown(
    doc({
      type: 'table',
      content: [
        { type: 'tableRow', content: [cell('tableHeader', 'Name'), cell('tableHeader', 'Value')] },
        { type: 'tableRow', content: [cell('tableCell', 'a|b'), cell('tableCell', 'c')] },
        { type: 'tableRow', content: [cell('tableCell', 'wide', { colspan: 2 })] },
        {
          type: 'tableRow',
          content: [
            {
              type: 'tableCell',
              content: [p(text('x'), { type: 'hardBreak' }, text('y')), p(text('z'))],
            },
          ],
        },
      ],
    }),
  );
  expect(markdown).toBe(
    [
      '| Name | Value |',
      '| --- | --- |',
      String.raw`| a\|b | c |`,
      '| wide |  |',
      '| x<br>y<br>z |  |',
    ].join('\n'),
  );
});

test('media go through the resolver, unknown ones keep their name', () => {
  const markdown = adfMarkdown(
    doc(media('m1', 'screen.png'), media('m2', 'spec [v2].pdf'), media('m3', 'lost.txt')),
    {
      media: ({ alt }) => {
        if (alt === 'screen.png') {
          return {
            name: alt,
            url: 'https://acme.atlassian.net/rest/api/3/attachment/content/1',
            image: true,
          };
        }
        return alt === 'spec [v2].pdf'
          ? {
              name: alt,
              url: 'https://acme.atlassian.net/rest/api/3/attachment/content/2',
              image: false,
            }
          : null;
      },
    },
  );
  expect(markdown).toBe(
    [
      '![screen.png](<https://acme.atlassian.net/rest/api/3/attachment/content/1>)',
      String.raw`[spec \[v2\].pdf](<https://acme.atlassian.net/rest/api/3/attachment/content/2>)`,
      '*lost.txt*',
    ].join('\n\n'),
  );
});

test('unknown nodes keep their text; strings and non-documents', () => {
  expect(adfMarkdown(doc({ type: 'futureBlock', content: [text('kept')] }))).toBe('kept');
  expect(adfMarkdown(doc(p({ type: 'inlineExtension', attrs: { text: 'macro' } })))).toBe('macro');
  expect(adfMarkdown('already *markdown*')).toBe('already *markdown*');
  expect(adfMarkdown(null)).toBe('');
  expect(adfMarkdown({ content: [] })).toBe('');
  expect(adfMarkdown(doc(p(), p(text('only'))))).toBe('only');
});

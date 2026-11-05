import { expect, test } from 'bun:test';

import type { NotionComment, NotionRichText } from './notion-comment-parse';
import { commentedSpans, discussionsOf, richTextMarkdown } from './notion-comments';

const PAGE = '11111111-2222-4333-8444-555555555555';
const BLOCK_A = 'aaaaaaaa-2222-4333-8444-555555555555';
const BLOCK_B = 'bbbbbbbb-2222-4333-8444-555555555555';
const ON_A = 'a0a0a0a0-2222-4333-8444-555555555555';
const ON_B = 'b0b0b0b0-2222-4333-8444-555555555555';

function url(block: string, discussion: string): string {
  return `discussion://${PAGE}/${block}/${discussion}`;
}

/** Lines shaped as a real page's markdown gives them: one span per run of marks, nested colors. */
const MARKDOWN = [
  '# Context',
  `- [ ] other text **<span discussion-urls="${url(BLOCK_B, ON_B)}">Who owns the field?</span>**`,
  `\t- [x] <span discussion-urls="${url(BLOCK_A, ON_A)}">on the </span>**<span discussion-urls="${url(BLOCK_A, ON_A)}">loan form, </span>**<span discussion-urls="${url(BLOCK_A, ON_A)}"><span color="red">the</span></span> field`,
].join('\n');

test('commented spans: one per discussion, in page order, quotes joined without marks', () => {
  expect(commentedSpans(MARKDOWN)).toEqual([
    { discussionId: ON_B, blockId: BLOCK_B, quote: 'Who owns the field?' },
    { discussionId: ON_A, blockId: BLOCK_A, quote: 'on the loan form, the' },
  ]);
  expect(commentedSpans('no comments here <span color="blue">blue</span>')).toEqual([]);
  const [coded] = commentedSpans(
    `<span discussion-urls="${url(BLOCK_A, ON_A)}">Fix \`daemon.json\` *now*</span>`,
  );
  expect(coded?.quote).toBe('Fix daemon.json now');
});

test('a very long quote is cut', () => {
  const long = 'word '.repeat(100);
  const [span] = commentedSpans(`<span discussion-urls="${url(BLOCK_A, ON_A)}">${long}</span>`);
  expect(span?.quote.endsWith('…')).toBe(true);
  expect(span?.quote.length).toBeLessThan(long.length);
});

function comment(
  id: string,
  discussionId: string,
  blockId: string | null,
  createdAt: string,
): NotionComment {
  return { id, discussionId, blockId, author: 'Grace', createdAt, richText: [] };
}

test('discussions: page ones first, then those on the text in page order, then whole blocks', () => {
  const comments = [
    comment('c1', ON_A, BLOCK_A, '2026-01-01T00:00:00.000Z'),
    comment('c2', 'page-late', null, '2026-01-05T00:00:00.000Z'),
    comment('c3', ON_B, BLOCK_B, '2026-01-03T00:00:00.000Z'),
    comment('c4', 'page-early', null, '2026-01-02T00:00:00.000Z'),
    comment('c5', 'whole-block', 'cccccccc', '2026-01-01T00:00:00.000Z'),
    comment('c6', ON_A, BLOCK_A, '2025-12-31T00:00:00.000Z'),
    // Read twice: from the page and from its block.
    comment('c1', ON_A, BLOCK_A, '2026-01-01T00:00:00.000Z'),
  ];
  const discussions = discussionsOf(comments, commentedSpans(MARKDOWN));
  expect(discussions.map((discussion) => discussion.id)).toEqual([
    'page-early',
    'page-late',
    ON_B,
    ON_A,
    'whole-block',
  ]);
  const onA = discussions.find((discussion) => discussion.id === ON_A);
  expect(onA?.comments.map((item) => item.id)).toEqual(['c6', 'c1']);
  expect(onA?.quote).toBe('on the loan form, the');
  expect(discussions.at(-1)?.quote).toBeNull();
});

test('discussion ids match with or without dashes', () => {
  const spans = commentedSpans(`<span discussion-urls="${url(BLOCK_A, ON_A)}">quoted</span>`);
  const [discussion] = discussionsOf(
    [comment('c1', ON_A.replaceAll('-', ''), BLOCK_A, '2026-01-01T00:00:00.000Z')],
    spans,
  );
  expect(discussion?.quote).toBe('quoted');
});

function run(text: string, marks: Partial<NotionRichText> = {}): NotionRichText {
  return {
    text,
    href: null,
    bold: false,
    italic: false,
    strikethrough: false,
    code: false,
    ...marks,
  };
}

test('rich text as markdown: marks, links and code, spaces outside the marks', () => {
  expect(
    richTextMarkdown([
      run('@Ada'),
      run(' is this '),
      run('really ', { bold: true }),
      run('a P2', { italic: true, strikethrough: true }),
      run('? See '),
      run('the spec', { href: 'https://www.notion.so/abc' }),
      run(' and '),
      run('exportCsv()', { code: true }),
      run('   ', { bold: true }),
    ]),
  ).toBe(
    '@Ada is this **really** ~~*a P2*~~? See [the spec](https://www.notion.so/abc) and `exportCsv()`   ',
  );
});

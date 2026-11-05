// A Notion page's open discussions: its comments grouped by thread, each inline one with the text it
// is about (from the `discussion-urls` spans of the page markdown). Pure and browser-safe.
import type { NotionComment, NotionRichText } from './notion-comment-parse';

/** A discussion span; its inner text stops at the first `</span>`, which nested spans may cut short. */
const DISCUSSION_SPAN =
  /<span\b[^>]*\bdiscussion-urls="(?<urls>[^"]*)"[^>]*>(?<inner>[\s\S]*?)<\/span>/gu;
const DISCUSSION_URL = /discussion:\/\/[^/\s,"]+\/(?<block>[^/\s,"]+)\/(?<discussion>[^/\s,"]+)/gu;
const TAGS = /<[^>]*>/gu;
const MARKS = /\*\*|~~/gu;
const SPACES = /\s+/gu;
/** A run's text: its spaces at both ends, kept outside the marks, and what they surround. */
const EDGES = /^(?<lead>\s*)(?<core>[\s\S]*?)(?<trail>\s*)$/u;
/** Longer quotes are cut: the tab shows which sentence, not the paragraph. */
const MAX_QUOTE = 300;

/** A discussion on a span of the page's text: the block it is in and the text, marks removed. */
export type CommentedSpan = { discussionId: string; blockId: string; quote: string };

/** A thread of comments, oldest first; `quote` is the text it is about, null when not known. */
export type NotionDiscussion = {
  id: string;
  blockId: string | null;
  quote: string | null;
  comments: NotionComment[];
};

/** Notion ids come with or without dashes. */
function idKey(id: string): string {
  return id.replaceAll('-', '').toLowerCase();
}

function cleanQuote(parts: string[]): string {
  const text = parts.join('').replace(TAGS, '').replace(MARKS, '').replace(SPACES, ' ').trim();
  return text.length > MAX_QUOTE ? `${text.slice(0, MAX_QUOTE).trimEnd()}…` : text;
}

/**
 * The discussions the page markdown marks on its text, in page order. Notion splits a commented
 * range into one span per run of marks: the quote joins them.
 */
export function commentedSpans(markdown: string): CommentedSpan[] {
  const found = new Map<string, { discussionId: string; blockId: string; parts: string[] }>();
  for (const span of markdown.matchAll(DISCUSSION_SPAN)) {
    for (const url of (span.groups?.urls ?? '').matchAll(DISCUSSION_URL)) {
      const { block = '', discussion = '' } = url.groups ?? {};
      const entry = found.get(idKey(discussion)) ?? {
        discussionId: discussion,
        blockId: block,
        parts: [],
      };
      entry.parts.push(span.groups?.inner ?? '');
      found.set(idKey(discussion), entry);
    }
  }
  return [...found.values()].map(({ discussionId, blockId, parts }) => ({
    discussionId,
    blockId,
    quote: cleanQuote(parts),
  }));
}

function byTime(left: NotionComment, right: NotionComment): number {
  return left.createdAt.localeCompare(right.createdAt);
}

function threadsOf(comments: NotionComment[]): NotionComment[][] {
  const seen = new Set<string>();
  const threads = new Map<string, NotionComment[]>();
  for (const comment of comments.toSorted(byTime)) {
    if (!seen.has(comment.id)) {
      seen.add(comment.id);
      const key = idKey(comment.discussionId);
      threads.set(key, [...(threads.get(key) ?? []), comment]);
    }
  }
  return [...threads.values()];
}

function startedBefore(left: NotionDiscussion, right: NotionDiscussion): number {
  const [first] = left.comments;
  const [other] = right.comments;
  return first && other ? byTime(first, other) : 0;
}

/**
 * The comments (read from the page and from its commented blocks, so possibly twice) as discussions:
 * the page's own first, then those on its text in page order, then those on a whole block (no span
 * marks them), each group oldest first.
 */
export function discussionsOf(
  comments: NotionComment[],
  spans: CommentedSpan[],
): NotionDiscussion[] {
  const order = new Map(spans.map((span, index) => [idKey(span.discussionId), index]));
  const discussions = threadsOf(comments).flatMap((thread): NotionDiscussion[] => {
    const [first] = thread;
    if (!first) {
      return [];
    }
    const span = spans[order.get(idKey(first.discussionId)) ?? -1];
    return [
      {
        id: first.discussionId,
        blockId: first.blockId,
        quote: span?.quote ?? null,
        comments: thread,
      },
    ];
  });
  const rank = (discussion: NotionDiscussion): number => order.get(idKey(discussion.id)) ?? -1;
  const onPage = discussions.filter((discussion) => discussion.blockId === null);
  const onBlocks = discussions.filter((discussion) => discussion.blockId !== null);
  const onText = onBlocks.filter((discussion) => rank(discussion) !== -1);
  const onBlock = onBlocks.filter((discussion) => rank(discussion) === -1);
  return [
    ...onPage.toSorted(startedBefore),
    ...onText.toSorted((left, right) => rank(left) - rank(right)),
    ...onBlock.toSorted(startedBefore),
  ];
}

function runMarkdown(run: NotionRichText): string {
  const { lead = '', core = '', trail = '' } = EDGES.exec(run.text)?.groups ?? {};
  if (core === '') {
    return run.text;
  }
  let text = run.code ? `\`${core}\`` : core;
  if (run.italic) {
    text = `*${text}*`;
  }
  if (run.bold) {
    text = `**${text}**`;
  }
  if (run.strikethrough) {
    text = `~~${text}~~`;
  }
  if (run.href) {
    text = `[${text}](${run.href})`;
  }
  return `${lead}${text}${trail}`;
}

/** A comment's text as markdown: marks around each run, its spaces kept outside them. */
export function richTextMarkdown(richText: NotionRichText[]): string {
  return richText.map((run) => runMarkdown(run)).join('');
}

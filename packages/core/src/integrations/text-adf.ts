// A rule's plain text (a comment, a multi-line field) as Atlassian Document Format, which Jira's REST v3 requires:
// paragraphs from blank lines, line breaks, and https links. No markdown: rule texts are written for Jira's readers.

type AdfText = { type: 'text'; text: string; marks?: { type: 'link'; attrs: { href: string } }[] };
/** A mention of a Jira user: Jira shows `@Name` and notifies them. */
type AdfMention = { type: 'mention'; attrs: { id: string; text: string } };
type AdfInline = AdfText | AdfMention | { type: 'hardBreak' };
type AdfParagraph = { type: 'paragraph'; content: AdfInline[] };

/** What a comment's `body` or a rich text field takes. */
export type AdfDocument = { type: 'doc'; version: 1; content: AdfParagraph[] };

const BLANK_LINES = /\n\s*\n/u;
const URL = /https?:\/\/[^\s<>"]+/gu;
/** Punctuation that ends a sentence, not the link: "see https://x.y/z." */
const TRAILING = /[.,;:!?)\]'"]+$/u;

/** One line's text, its links as linked text. */
function lineContent(line: string): AdfText[] {
  const parts: AdfText[] = [];
  let last = 0;
  for (const match of line.matchAll(URL)) {
    const href = match[0].replace(TRAILING, '');
    const start = match.index;
    if (start > last) {
      parts.push({ type: 'text', text: line.slice(last, start) });
    }
    parts.push({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] });
    last = start + href.length;
  }
  if (last < line.length) {
    parts.push({ type: 'text', text: line.slice(last) });
  }
  return parts;
}

function paragraph(block: string): AdfParagraph {
  const content: AdfInline[] = [];
  for (const [index, line] of block.split('\n').entries()) {
    if (index > 0) {
      content.push({ type: 'hardBreak' });
    }
    content.push(...lineContent(line.trimEnd()));
  }
  return { type: 'paragraph', content };
}

/**
 * The text as an ADF document; an empty text gives an empty document. With `mention`, the first
 * paragraph starts with a mention of that user (a reply: Jira comments have no threads).
 */
export function textAdf(
  text: string,
  mention: { accountId: string; name: string } | null = null,
): AdfDocument {
  const blocks = text
    .replaceAll('\r\n', '\n')
    .split(BLANK_LINES)
    .map((block) => block.trim())
    .filter((block) => block !== '');
  const content = blocks.map((block) => paragraph(block));
  const [first] = content;
  if (mention && first) {
    const at: AdfMention = {
      type: 'mention',
      attrs: { id: mention.accountId, text: `@${mention.name}` },
    };
    first.content.unshift(at, { type: 'text', text: ' ' });
  }
  return { type: 'doc', version: 1, content };
}

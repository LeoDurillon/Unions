// ADF inline content (text with marks, mentions, dates, cards, inline media) as markdown on one line.

import { mediaMarkdown } from './adf-media';
import {
  type AdfContext,
  type AdfMark,
  type AdfNode,
  numberAttr,
  plainText,
  stringAttr,
} from './adf-node';

/** Markdown's inline syntax characters; `_` only at a word's edge, since GFM ignores it inside words. */
const SPECIAL = /[\\`*[\]<>]|(?<!\w)_|_(?!\w)/gu;
const BACKTICKS = /`+/gu;
const EDGE_SPACE = /^(?<lead>\s*)(?<core>[\s\S]*?)(?<trail>\s*)$/u;

/** Delimiters of the marks that wrap text, innermost first; code and links are handled apart. */
const WRAPS: [string, string][] = [
  ['em', '*'],
  ['strong', '**'],
  ['strike', '~~'],
];

function escapeText(text: string): string {
  return text.replaceAll(SPECIAL, (character) => `\\${character}`);
}

/** Inline code, fenced with one backtick more than the longest run inside. */
function codeSpan(text: string): string {
  const longest = Math.max(0, ...[...text.matchAll(BACKTICKS)].map((match) => match[0].length));
  const fence = '`'.repeat(longest + 1);
  const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : '';
  return `${fence}${pad}${text}${pad}${fence}`;
}

/** Wraps text in a delimiter, leaving its edge spaces outside: `** a **` is not bold. */
function wrap(text: string, delimiter: string): string {
  const { lead = '', core = '', trail = '' } = EDGE_SPACE.exec(text)?.groups ?? {};
  return core === '' ? text : `${lead}${delimiter}${core}${delimiter}${trail}`;
}

function hasMark(marks: AdfMark[], type: string): boolean {
  return marks.some((mark) => mark.type === type);
}

function textMarkdown(node: AdfNode): string {
  const { marks } = node;
  let out = hasMark(marks, 'code') ? codeSpan(node.text) : escapeText(node.text);
  for (const [type, delimiter] of WRAPS) {
    if (hasMark(marks, type)) {
      out = wrap(out, delimiter);
    }
  }
  const href = marks.find((mark) => mark.type === 'link')?.attrs.href;
  return typeof href === 'string' && href !== '' ? `[${out}](${href})` : out;
}

function sameMarks(a: AdfMark[], b: AdfMark[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Adjacent text nodes with the same marks as one, so `**a****b**` reads `**ab**`. */
function mergeText(nodes: AdfNode[]): AdfNode[] {
  const merged: AdfNode[] = [];
  for (const node of nodes) {
    const last = merged.at(-1);
    if (last?.type === 'text' && node.type === 'text' && sameMarks(last.marks, node.marks)) {
      merged[merged.length - 1] = { ...last, text: last.text + node.text };
    } else {
      merged.push(node);
    }
  }
  return merged;
}

/** A date node's day, from its timestamp in milliseconds (UTC, as Jira shows it). */
function dateText(node: AdfNode): string {
  const timestamp = numberAttr(node.attrs, 'timestamp');
  return timestamp === null ? '' : new Date(timestamp).toISOString().slice(0, 'YYYY-MM-DD'.length);
}

function mentionText(node: AdfNode): string {
  const text = stringAttr(node.attrs, 'text') ?? 'someone';
  return escapeText(text.startsWith('@') ? text : `@${text}`);
}

function cardText(node: AdfNode): string {
  const url = stringAttr(node.attrs, 'url');
  return url === null ? '' : `<${url}>`;
}

type InlineRenderer = (node: AdfNode, context: AdfContext) => string;

const INLINE: Record<string, InlineRenderer> = {
  text: textMarkdown,
  hardBreak: (_node, context) => (context.inTable ? '<br>' : '\\\n'),
  mention: mentionText,
  emoji: (node) => stringAttr(node.attrs, 'text') ?? stringAttr(node.attrs, 'shortName') ?? '',
  date: dateText,
  status: (node) => `\\[${escapeText(stringAttr(node.attrs, 'text') ?? '')}\\]`,
  inlineCard: cardText,
  mediaInline: (node, context) => mediaMarkdown(node, context),
  placeholder: () => '',
};

/** Inline nodes as markdown; an unknown one keeps its text. */
export function inlineMarkdown(nodes: AdfNode[], context: AdfContext): string {
  return mergeText(nodes)
    .map((node) => {
      const render = INLINE[node.type];
      return render ? render(node, context) : escapeText(plainText(node));
    })
    .join('');
}

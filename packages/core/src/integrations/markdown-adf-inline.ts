// Markdown's inline content (an mdast phrasing tree) as ADF inline nodes: text with its marks, breaks, links, mentions.
import type { Nodes, PhrasingContent } from 'mdast';

import type { AdfInlineNode, AdfMark } from './adf-types';
import { MENTION_SCHEME } from './tracker-mention';

/** What converting needs from the whole document: link definitions, and unique ids for task lists. */
export type MarkdownContext = { definitions: ReadonlyMap<string, string>; nextId: () => string };

const TAG = /<[^>]*>/gu;
const NEWLINES = /\s*\n\s*/gu;

/** A node's text and its descendants', for what ADF has no place for. */
export function plainText(node: Nodes): string {
  if ('value' in node && typeof node.value === 'string') {
    return node.type === 'html' ? node.value.replaceAll(TAG, '') : node.value;
  }
  return 'children' in node ? node.children.map((child) => plainText(child)).join('') : '';
}

/** A text node; code takes no other mark than a link (ADF's rule); empty text is no node. */
function textNode(text: string, marks: AdfMark[]): AdfInlineNode[] {
  if (text === '') {
    return [];
  }
  const code = marks.some((mark) => mark.type === 'code');
  const kept = code ? marks.filter((mark) => mark.type === 'code' || mark.type === 'link') : marks;
  return [kept.length === 0 ? { type: 'text', text } : { type: 'text', text, marks: kept }];
}

function linked(href: string, marks: AdfMark[]): AdfMark[] {
  return [...marks.filter((mark) => mark.type !== 'link'), { type: 'link', attrs: { href } }];
}

type Converter = (
  node: PhrasingContent,
  marks: AdfMark[],
  context: MarkdownContext,
) => AdfInlineNode[];

const WITH_MARK: Partial<Record<PhrasingContent['type'], AdfMark>> = {
  emphasis: { type: 'em' },
  strong: { type: 'strong' },
  delete: { type: 'strike' },
};

function reference(identifier: string, context: MarkdownContext): string | null {
  return context.definitions.get(identifier.toLowerCase()) ?? null;
}

const CONVERTERS: Partial<Record<PhrasingContent['type'], Converter>> = {
  // A soft line break inside a paragraph is a space.
  text: (node, marks) => textNode(plainText(node).replaceAll(NEWLINES, ' '), marks),
  inlineCode: (node, marks) => textNode(plainText(node), [...marks, { type: 'code' }]),
  break: () => [{ type: 'hardBreak' }],
  html: (node, marks) => textNode(plainText(node), marks),
  link: (node, marks, context) => {
    if (node.type !== 'link') {
      return [];
    }
    // A mention token (`tracker-mention.ts`): Jira shows `@Name` and notifies them.
    if (node.url.startsWith(MENTION_SCHEME)) {
      const id = node.url.slice(MENTION_SCHEME.length);
      return [{ type: 'mention', attrs: { id, text: plainText(node) } }];
    }
    return inlineAdf(node.children, linked(node.url, marks), context);
  },
  linkReference: (node, marks, context) => {
    if (node.type !== 'linkReference') {
      return [];
    }
    const href = reference(node.identifier, context);
    return inlineAdf(node.children, href === null ? marks : linked(href, marks), context);
  },
  // An image is not uploaded: its alt text (or address) links to it.
  image: (node, marks) =>
    node.type === 'image' ? textNode(node.alt ?? node.url, linked(node.url, marks)) : [],
  imageReference: (node, marks, context) => {
    if (node.type !== 'imageReference') {
      return [];
    }
    const href = reference(node.identifier, context);
    const text = node.alt ?? node.identifier;
    return textNode(text, href === null ? marks : linked(href, marks));
  },
  footnoteReference: (node, marks) =>
    node.type === 'footnoteReference' ? textNode(`[^${node.label ?? node.identifier}]`, marks) : [],
};

/** Inline content as ADF, the marks of its enclosing emphasis, strong text or link applied. */
export function inlineAdf(
  nodes: readonly PhrasingContent[],
  marks: AdfMark[],
  context: MarkdownContext,
): AdfInlineNode[] {
  return nodes.flatMap((node) => {
    const mark = WITH_MARK[node.type];
    if (mark && 'children' in node) {
      return inlineAdf(node.children, [...marks, mark], context);
    }
    const convert = CONVERTERS[node.type];
    return convert ? convert(node, marks, context) : textNode(plainText(node), marks);
  });
}

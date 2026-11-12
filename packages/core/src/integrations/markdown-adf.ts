// Markdown (a ticket's description, as an agent writes it) as Atlassian Document Format, for a Jira
// issue. Parsed with mdast and GitHub's extensions (tables, task lists, strikethrough), as Union
// renders it, then mapped node by node.
import type { BlockContent, DefinitionContent, Nodes, Root, RootContent } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { gfm } from 'micromark-extension-gfm';

import type { AdfBlock, AdfRichDocument } from './adf-types';
import { inlineAdf, plainText, type MarkdownContext } from './markdown-adf-inline';
import { listAdf, nestable, tableAdf } from './markdown-adf-lists';

const HEADING_LEVELS = 6;

type Block = BlockContent | DefinitionContent;
type Converter = (node: Block, context: MarkdownContext) => AdfBlock[];

const BLOCK_TYPES = new Set<string>([
  'paragraph',
  'heading',
  'thematicBreak',
  'blockquote',
  'list',
  'table',
  'html',
  'code',
  'definition',
  'footnoteDefinition',
]);

/** A block of the document (front matter and stray inline nodes are not). */
function isBlock(node: RootContent): node is Block {
  return BLOCK_TYPES.has(node.type);
}

/** The text as a paragraph, or nothing for blank text. */
function textParagraph(text: string): AdfBlock[] {
  const trimmed = text.trim();
  return trimmed === '' ? [] : [{ type: 'paragraph', content: [{ type: 'text', text: trimmed }] }];
}

const CONVERTERS: Partial<Record<Block['type'], Converter>> = {
  paragraph: (node, context) => {
    const content = node.type === 'paragraph' ? inlineAdf(node.children, [], context) : [];
    return content.length === 0 ? [] : [{ type: 'paragraph', content }];
  },
  heading: (node, context) =>
    node.type === 'heading'
      ? [
          {
            type: 'heading',
            attrs: { level: Math.min(HEADING_LEVELS, node.depth) },
            content: inlineAdf(node.children, [], context),
          },
        ]
      : [],
  thematicBreak: () => [{ type: 'rule' }],
  code: (node) => {
    if (node.type !== 'code') {
      return [];
    }
    const content = node.value === '' ? [] : [{ type: 'text' as const, text: node.value }];
    return [
      { type: 'codeBlock', ...(node.lang ? { attrs: { language: node.lang } } : {}), content },
    ];
  },
  blockquote: (node, context) =>
    node.type === 'blockquote'
      ? [{ type: 'blockquote', content: nestable(node.children, context, blockAdf) }]
      : [],
  list: (node, context) => (node.type === 'list' ? [listAdf(node, context, blockAdf)] : []),
  table: (node, context) => (node.type === 'table' ? [tableAdf(node, context)] : []),
  html: (node) => textParagraph(plainText(node)),
  // Link definitions are resolved where they are used.
  definition: () => [],
  footnoteDefinition: (node) =>
    node.type === 'footnoteDefinition'
      ? textParagraph(`[^${node.label ?? node.identifier}]: ${plainText(node)}`)
      : [],
};

/** A block as ADF; one ADF has no place for becomes a paragraph of its text. */
function blockAdf(node: Block, context: MarkdownContext): AdfBlock[] {
  const convert = CONVERTERS[node.type];
  return convert ? convert(node, context) : textParagraph(plainText(node));
}

/** The document's link definitions (`[name]: https://…`), by their lowercased label. */
function definitionsOf(root: Root): Map<string, string> {
  const found = new Map<string, string>();
  const visit = (node: Nodes): void => {
    if (node.type === 'definition') {
      found.set(node.identifier.toLowerCase(), node.url);
    }
    if ('children' in node) {
      for (const child of node.children) {
        visit(child);
      }
    }
  };
  visit(root);
  return found;
}

/** Markdown as an ADF document; an empty text gives an empty document. */
export function markdownAdf(markdown: string): AdfRichDocument {
  const root = fromMarkdown(markdown, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });
  let ids = 0;
  const context: MarkdownContext = {
    definitions: definitionsOf(root),
    nextId: () => {
      ids += 1;
      return `union-${ids}`;
    },
  };
  const content = root.children.flatMap((node) =>
    isBlock(node) ? blockAdf(node, context) : textParagraph(plainText(node)),
  );
  return { type: 'doc', version: 1, content };
}

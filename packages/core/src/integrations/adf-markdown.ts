// Atlassian Document Format (a Jira Cloud issue's description, REST v3) as GitHub-flavored markdown.
// Pure: media nodes become links through the caller's resolver, as nothing here knows the issue's files.
import { inlineMarkdown } from './adf-inline';
import { bulletList, decisionList, orderedList, taskList } from './adf-lists';
import { mediaGroupMarkdown } from './adf-media';
import {
  type AdfContext,
  type AdfNode,
  type MediaResolver,
  adfNodeOf,
  numberAttr,
  plainText,
  stringAttr,
} from './adf-node';
import { tableMarkdown } from './adf-table';

const BACKTICK_RUNS = /`{3,}/gu;
const HEADING_LEVELS = 6;
const MIN_FENCE = 3;

/** Panel types as GitHub's alerts, a quote headed by its kind. */
const ALERTS: Record<string, string> = {
  info: 'NOTE',
  note: 'NOTE',
  success: 'TIP',
  warning: 'WARNING',
  error: 'CAUTION',
};

function quote(text: string): string {
  return text
    .split('\n')
    .map((line) => (line === '' ? '>' : `> ${line}`))
    .join('\n');
}

function codeBlock(node: AdfNode): string {
  const code = node.content.map(plainText).join('');
  const longest = Math.max(0, ...[...code.matchAll(BACKTICK_RUNS)].map((m) => m[0].length));
  const fence = '`'.repeat(Math.max(MIN_FENCE, longest + 1));
  return `${fence}${stringAttr(node.attrs, 'language') ?? ''}\n${code}\n${fence}`;
}

function heading(node: AdfNode, context: AdfContext): string {
  const level = Math.min(HEADING_LEVELS, Math.max(1, numberAttr(node.attrs, 'level') ?? 1));
  return `${'#'.repeat(level)} ${inlineMarkdown(node.content, context)}`;
}

function panel(node: AdfNode, context: AdfContext): string {
  const alert = ALERTS[stringAttr(node.attrs, 'panelType') ?? ''] ?? 'NOTE';
  return quote(`[!${alert}]\n${renderBlocks(node.content, context)}`);
}

/** A collapsed section, open: its title in bold, then its content. */
function expand(node: AdfNode, context: AdfContext): string {
  const title = stringAttr(node.attrs, 'title');
  const body = renderBlocks(node.content, context);
  return title === null ? body : `**${title}**\n\n${body}`;
}

/** An image or file block, with its caption under it. */
function mediaSingle(node: AdfNode, context: AdfContext): string {
  const caption = node.content.find((child) => child.type === 'caption');
  const media = mediaGroupMarkdown(node, context);
  return caption ? `${media}\n${inlineMarkdown(caption.content, context)}` : media;
}

function card(node: AdfNode): string {
  const url = stringAttr(node.attrs, 'url');
  return url === null ? '' : `<${url}>`;
}

type BlockRender = (node: AdfNode, context: AdfContext) => string;

const BLOCKS: Record<string, BlockRender> = {
  paragraph: (node, context) => inlineMarkdown(node.content, context),
  heading,
  bulletList: (node, context) => bulletList(node, context, renderBlocks),
  orderedList: (node, context) => orderedList(node, context, renderBlocks),
  taskList: (node, context) => taskList(node, context, renderBlocks),
  decisionList,
  codeBlock,
  blockquote: (node, context) => quote(renderBlocks(node.content, context)),
  panel,
  rule: () => '---',
  table: (node, context) => tableMarkdown(node, context, renderBlocks),
  expand,
  nestedExpand: expand,
  mediaSingle,
  mediaGroup: mediaGroupMarkdown,
  blockCard: card,
  embedCard: card,
  layoutSection: (node, context) => renderBlocks(node.content, context),
  layoutColumn: (node, context) => renderBlocks(node.content, context),
  bodiedExtension: (node, context) => renderBlocks(node.content, context),
};

/** A node as a block; an inline node standing alone is rendered inline, an unknown one keeps its text. */
function renderBlock(node: AdfNode, context: AdfContext): string {
  const render = BLOCKS[node.type];
  return render ? render(node, context) : inlineMarkdown([node], context);
}

function renderBlocks(nodes: AdfNode[], context: AdfContext): string {
  return nodes
    .map((node) => renderBlock(node, context))
    .filter((block) => block.trim() !== '')
    .join('\n\n');
}

/**
 * A document (or a node) as markdown. A string goes through unchanged: older APIs and some fields give
 * text already. Anything else that is not ADF gives an empty string.
 */
export function adfMarkdown(document: unknown, options: { media?: MediaResolver } = {}): string {
  if (typeof document === 'string') {
    return document;
  }
  const node = adfNodeOf(document);
  if (node === null) {
    return '';
  }
  const context: AdfContext = { media: options.media ?? (() => null), inTable: false };
  return renderBlocks(node.type === 'doc' ? node.content : [node], context).trim();
}

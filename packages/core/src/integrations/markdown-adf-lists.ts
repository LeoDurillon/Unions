// Markdown's lists (bullet, ordered, task lists) and tables as ADF, their items' blocks kept to what ADF allows there.
import type { BlockContent, DefinitionContent, List, ListItem, Table } from 'mdast';

import type {
  AdfBlock,
  AdfInlineNode,
  AdfList,
  AdfNestable,
  AdfTable,
  AdfTaskItem,
  AdfTaskList,
} from './adf-types';
import { inlineAdf, plainText, type MarkdownContext } from './markdown-adf-inline';

/** Converts a block; passed in so lists can hold any block without a cycle between files. */
export type BlockConverter = (
  node: BlockContent | DefinitionContent,
  context: MarkdownContext,
) => AdfBlock[];

function isNestable(block: AdfBlock): block is AdfNestable {
  return (
    block.type === 'paragraph' ||
    block.type === 'bulletList' ||
    block.type === 'orderedList' ||
    block.type === 'codeBlock'
  );
}

/**
 * Blocks where ADF takes only paragraphs, lists and code (a list item, a quote): any other block
 * (a heading, a table, a task list) becomes a paragraph of its text.
 */
export function nestable(
  nodes: readonly (BlockContent | DefinitionContent)[],
  context: MarkdownContext,
  convert: BlockConverter,
): AdfNestable[] {
  return nodes.flatMap((node) =>
    convert(node, context).map((block): AdfNestable => {
      if (isNestable(block)) {
        return block;
      }
      return { type: 'paragraph', content: [{ type: 'text', text: plainText(node) }] };
    }),
  );
}

function taskItem(item: ListItem, context: MarkdownContext): (AdfTaskItem | AdfTaskList)[] {
  // The item's id before its nested lists': ids follow the document.
  const localId = context.nextId();
  const content: AdfInlineNode[] = [];
  const nested: AdfTaskList[] = [];
  for (const child of item.children) {
    if (child.type === 'paragraph') {
      content.push(
        ...(content.length > 0 ? [{ type: 'hardBreak' } as const] : []),
        ...inlineAdf(child.children, [], context),
      );
    } else if (child.type === 'list' && isTaskList(child)) {
      nested.push(taskList(child, context));
    } else {
      content.push({ type: 'hardBreak' }, { type: 'text', text: plainText(child) });
    }
  }
  const state = item.checked === true ? 'DONE' : 'TODO';
  return [{ type: 'taskItem', attrs: { localId, state }, content }, ...nested];
}

/** Every item has a box: `- [ ]` or `- [x]`. */
function isTaskList(list: List): boolean {
  return (
    list.children.length > 0 && list.children.every((item) => typeof item.checked === 'boolean')
  );
}

function taskList(list: List, context: MarkdownContext): AdfTaskList {
  return {
    type: 'taskList',
    attrs: { localId: context.nextId() },
    content: list.children.flatMap((item) => taskItem(item, context)),
  };
}

/** A list as ADF: a task list when every item has a box, else bullets or numbers (from its start). */
export function listAdf(
  list: List,
  context: MarkdownContext,
  convert: BlockConverter,
): AdfList | AdfTaskList {
  if (isTaskList(list)) {
    return taskList(list, context);
  }
  const content = list.children.map((item) => ({
    type: 'listItem' as const,
    content: nestable(item.children, context, convert),
  }));
  return list.ordered
    ? { type: 'orderedList', attrs: { order: list.start ?? 1 }, content }
    : { type: 'bulletList', content };
}

/** A table: its first row as header cells, each cell one paragraph. */
export function tableAdf(table: Table, context: MarkdownContext): AdfTable {
  return {
    type: 'table',
    content: table.children.map((row, index) => ({
      type: 'tableRow' as const,
      content: row.children.map((cell) => ({
        type: index === 0 ? ('tableHeader' as const) : ('tableCell' as const),
        content: [{ type: 'paragraph' as const, content: inlineAdf(cell.children, [], context) }],
      })),
    })),
  };
}

// ADF lists (bullet, ordered, task and decision lists) as markdown lists, nested lists indented.
import { inlineMarkdown } from './adf-inline';
import { type AdfContext, type AdfNode, type BlockRenderer, numberAttr } from './adf-node';

/** The item's text after its marker, later lines indented under the text so they stay in the item. */
function item(marker: string, body: string): string {
  const indent = ' '.repeat(marker.length);
  const [first = '', ...rest] = body.split('\n');
  return [marker + first, ...rest.map((line) => (line === '' ? '' : indent + line))].join('\n');
}

/** A list item's blocks; tight (one newline) unless it holds several paragraphs. */
function itemBody(node: AdfNode, context: AdfContext, render: BlockRenderer): string {
  const paragraphs = node.content.filter((child) => child.type === 'paragraph').length;
  if (paragraphs > 1) {
    return render(node.content, context);
  }
  return node.content.map((child) => render([child], context)).join('\n');
}

export function bulletList(node: AdfNode, context: AdfContext, render: BlockRenderer): string {
  return node.content.map((child) => item('- ', itemBody(child, context, render))).join('\n');
}

export function orderedList(node: AdfNode, context: AdfContext, render: BlockRenderer): string {
  const start = Math.max(0, Math.trunc(numberAttr(node.attrs, 'order') ?? 1));
  return node.content
    .map((child, index) => item(`${start + index}. `, itemBody(child, context, render)))
    .join('\n');
}

/** A task list: checked items are `DONE`; a nested task list (a child of the list) is indented. */
export function taskList(node: AdfNode, context: AdfContext, render: BlockRenderer): string {
  return node.content
    .map((child) => {
      if (child.type !== 'taskItem') {
        return item('  ', render([child], context));
      }
      const box = child.attrs.state === 'DONE' ? '[x]' : '[ ]';
      return item(`- ${box} `, inlineMarkdown(child.content, context));
    })
    .join('\n');
}

export function decisionList(node: AdfNode, context: AdfContext): string {
  return node.content
    .map((child) => item('- ', `Decision: ${inlineMarkdown(child.content, context)}`))
    .join('\n');
}

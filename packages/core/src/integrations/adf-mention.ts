// A reply's mention of the comment's author, put first in the comment's ADF: Jira comments have no threads.
import type { AdfBlock, AdfInlineNode, AdfRichDocument } from './adf-types';

/** Who a reply answers: Jira shows `@Name` and notifies them. */
export type MentionTarget = { accountId: string; name: string };

/**
 * The document with the mention at the start of its first paragraph; when it starts otherwise (a list,
 * a code block), a paragraph holding the mention comes first. An empty document is the mention alone.
 */
export function withLeadingMention(
  document: AdfRichDocument,
  mention: MentionTarget,
): AdfRichDocument {
  const at: AdfInlineNode = {
    type: 'mention',
    attrs: { id: mention.accountId, text: `@${mention.name}` },
  };
  const [first, ...rest] = document.content;
  if (first?.type === 'paragraph') {
    const opening: AdfBlock = {
      ...first,
      content: [at, { type: 'text', text: ' ' }, ...first.content],
    };
    return { ...document, content: [opening, ...rest] };
  }
  return { ...document, content: [{ type: 'paragraph', content: [at] }, ...document.content] };
}

// The Atlassian Document Format nodes Union writes to Jira (an issue's description, a comment), as types.

export type AdfMark =
  | { type: 'strong' }
  | { type: 'em' }
  | { type: 'code' }
  | { type: 'strike' }
  | { type: 'link'; attrs: { href: string } };

type AdfText = { type: 'text'; text: string; marks?: AdfMark[] };

export type AdfInlineNode =
  | AdfText
  | { type: 'hardBreak' }
  | { type: 'mention'; attrs: { id: string; text: string } };

type AdfParagraph = { type: 'paragraph'; content: AdfInlineNode[] };

type AdfCodeBlock = { type: 'codeBlock'; attrs?: { language: string }; content: AdfText[] };

export type AdfList =
  | { type: 'bulletList'; content: AdfListItem[] }
  | { type: 'orderedList'; attrs: { order: number }; content: AdfListItem[] };

/** What a list item, or a quote, may hold. */
export type AdfNestable = AdfParagraph | AdfList | AdfCodeBlock;

type AdfListItem = { type: 'listItem'; content: AdfNestable[] };

export type AdfTaskItem = {
  type: 'taskItem';
  attrs: { localId: string; state: 'TODO' | 'DONE' };
  content: AdfInlineNode[];
};

export type AdfTaskList = {
  type: 'taskList';
  attrs: { localId: string };
  content: (AdfTaskItem | AdfTaskList)[];
};

type AdfTableCell = { type: 'tableHeader' | 'tableCell'; content: AdfParagraph[] };

export type AdfTable = { type: 'table'; content: { type: 'tableRow'; content: AdfTableCell[] }[] };

export type AdfBlock =
  | AdfNestable
  | { type: 'heading'; attrs: { level: number }; content: AdfInlineNode[] }
  | AdfTaskList
  | { type: 'blockquote'; content: AdfNestable[] }
  | AdfTable
  | { type: 'rule' };

export type AdfRichDocument = { type: 'doc'; version: 1; content: AdfBlock[] };

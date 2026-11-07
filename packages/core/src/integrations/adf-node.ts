// Atlassian Document Format (Jira Cloud's rich text) as a typed tree, read from unchecked JSON.

export type AdfMark = { type: string; attrs: Record<string, unknown> };

export type AdfNode = {
  type: string;
  attrs: Record<string, unknown>;
  content: AdfNode[];
  text: string;
  marks: AdfMark[];
};

/** A media node of the document: what Jira says of the file, for the caller to find it. */
export type AdfMedia = { id: string | null; alt: string | null; mediaType: string | null };

/** A media node's file as a link; null when the caller does not know it. */
type MediaLink = { name: string; url: string; image: boolean };

export type MediaResolver = (media: AdfMedia) => MediaLink | null;

/** What rendering a node needs to know of where it is. */
export type AdfContext = { media: MediaResolver; inTable: boolean };

/** Renders a list of block nodes as markdown; passed down so lists and tables can hold blocks. */
export type BlockRenderer = (nodes: AdfNode[], context: AdfContext) => string;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function recordOf(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function markOf(value: unknown): AdfMark | null {
  return isRecord(value) && typeof value.type === 'string'
    ? { type: value.type, attrs: recordOf(value.attrs) }
    : null;
}

/** The node, or null when the value is not one; children that are not nodes are dropped. */
export function adfNodeOf(value: unknown): AdfNode | null {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return null;
  }
  const content = Array.isArray(value.content) ? value.content : [];
  const marks = Array.isArray(value.marks) ? value.marks : [];
  return {
    type: value.type,
    attrs: recordOf(value.attrs),
    content: content.map((child) => adfNodeOf(child)).filter((node) => node !== null),
    text: typeof value.text === 'string' ? value.text : '',
    marks: marks.map((mark) => markOf(mark)).filter((mark) => mark !== null),
  };
}

/** A string attribute; null when absent, empty or not a string. */
export function stringAttr(attrs: Record<string, unknown>, name: string): string | null {
  const value = attrs[name];
  return typeof value === 'string' && value !== '' ? value : null;
}

/** A number attribute, also when Jira gives it as a string (`timestamp`); null otherwise. */
export function numberAttr(attrs: Record<string, unknown>, name: string): number | null {
  const value = attrs[name];
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null;
}

/** The plain text of a node and its descendants: what an unknown node keeps. */
export function plainText(node: AdfNode): string {
  if (node.type === 'text') {
    return node.text;
  }
  const own = stringAttr(node.attrs, 'text') ?? stringAttr(node.attrs, 'url') ?? '';
  return own + node.content.map(plainText).join('');
}

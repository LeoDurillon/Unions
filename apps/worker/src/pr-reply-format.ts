// The replies turn's prompt (the comments to answer) and answer format, and its answer read back as one reply per comment.
import { isRecord, replyBodyProblem, type ReviewComment } from '@union/core';

/** What the turn reads of a review comment imported from GitHub. */
export type RepliedComment = Pick<
  ReviewComment,
  'id' | 'kind' | 'path' | 'side' | 'startLine' | 'endLine' | 'body'
>;

export type SuggestedReply = { id: number; body: string; resolve: boolean };

/** Appended by the host, never editable: the replies are read from this block. */
const REPLIES_FORMAT = `End your answer with one fenced \`json\` block, and nothing after it:

\`\`\`json
{"replies": [{"id": 12, "body": "Fixed in 3f2a1c: …", "resolve": true}]}
\`\`\`

- \`id\`: the comment's number, as its heading gives it.
- \`body\`: the reply, in markdown.
- \`resolve\`: \`true\` when the change settles a comment on lines, so its thread can be closed; \`false\` otherwise, and always for a comment on the pull request.
Reply to every comment; leave one out only when there is nothing to say to its author.`;

function placeOf(comment: RepliedComment): string {
  if (comment.kind === 'general') {
    return 'on the pull request';
  }
  const lines =
    comment.startLine === comment.endLine
      ? `line ${comment.startLine}`
      : `lines ${comment.startLine}-${comment.endLine}`;
  return `${comment.path}, ${lines}${comment.side === 'old' ? ' (removed code)' : ''}`;
}

/** The role's prompt, the comments with their number and place (each one's text names its authors), then the format. */
export function repliesPrompt(guidance: string, comments: readonly RepliedComment[]): string {
  const listed = comments.map(
    (comment) => `## Comment ${comment.id}: ${placeOf(comment)}\n\n${comment.body.trim()}`,
  );
  return [guidance.trim(), '# Comments to reply to', ...listed, REPLIES_FORMAT].join('\n\n');
}

const JSON_BLOCK = /```json[^\n]*\n(?<json>[\s\S]*?)\n\s*```/gu;

function parseJson(source: string): unknown {
  try {
    return JSON.parse(source) as unknown;
  } catch {
    return null;
  }
}

/** The entries of the answer's last `json` block; none when it has no readable one. */
function entriesOf(answer: string): unknown[] {
  const blocks = [...answer.matchAll(JSON_BLOCK)];
  const parsed = parseJson(blocks.at(-1)?.groups?.json ?? '');
  return isRecord(parsed) && Array.isArray(parsed.replies) ? parsed.replies : [];
}

/**
 * One reply per comment asked, in the answer's order: entries for another id, a second one for the
 * same id, and texts GitHub would refuse are dropped. Only a comment on lines has a thread to resolve.
 */
export function repliesOf(answer: string, comments: readonly RepliedComment[]): SuggestedReply[] {
  const asked = new Map(comments.map((comment) => [comment.id, comment]));
  const replies = new Map<number, SuggestedReply>();
  for (const entry of entriesOf(answer)) {
    const id = isRecord(entry) ? Number(entry.id) : Number.NaN;
    const body = isRecord(entry) && typeof entry.body === 'string' ? entry.body.trim() : '';
    const comment = asked.get(id);
    if (comment && !replies.has(id) && replyBodyProblem(body) === null) {
      const resolve = comment.kind === 'line' && isRecord(entry) && entry.resolve === true;
      replies.set(id, { id, body, resolve });
    }
  }
  return [...replies.values()];
}

/** `review-import.ts` writes an imported note as `**@author** commented on GitHub:` then its text. */
const IMPORTED_NOTE = /^\*\*@(?<author>[^*\s]+)\*\* [^\n]*:\n\n(?<text>[\s\S]*)$/u;

/** The author and text of an imported conversation comment or review summary; null once edited out of that shape. */
export function importedNote(body: string): { author: string; body: string } | null {
  const match = IMPORTED_NOTE.exec(body.trim());
  const author = match?.groups?.author;
  const text = match?.groups?.text;
  return author && text ? { author, body: text } : null;
}

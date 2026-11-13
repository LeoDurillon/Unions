// The `@name` being typed at the caret of a comment box, and the box's text once a person is picked for it.

import { mentionToken, type TrackerPerson } from '@union/core/tracker-mention';

/** A name longer than this is no longer one being typed. */
const MAX_QUERY = 40;
/** What may come right before the `@`: the start, a space or an opening bracket (not an email address). */
const OPENING = /(?:^|[\s([{])$/u;

/** The `@` typed before the caret: where it is, and the text after it so far. */
export type MentionQuery = { start: number; query: string };

/** The `@name` the caret ends, or null when it is not in one (a line break or a long text ends it). */
export function mentionAt(text: string, caret: number): MentionQuery | null {
  const before = text.slice(0, caret);
  const start = before.lastIndexOf('@');
  if (start === -1 || !OPENING.test(before.slice(0, start))) {
    return null;
  }
  const query = before.slice(start + 1);
  if (query.length > MAX_QUERY || query.includes('\n') || query.startsWith(' ')) {
    return null;
  }
  return { start, query };
}

/** The text with the `@name` typed replaced by `person`'s token and a space, and the caret after them. */
export function insertMention(
  text: string,
  at: MentionQuery,
  person: TrackerPerson,
): { text: string; caret: number } {
  const inserted = `${mentionToken(person)} `;
  const end = at.start + 1 + at.query.length;
  const after = text.slice(end).replace(/^ /u, '');
  return { text: text.slice(0, at.start) + inserted + after, caret: at.start + inserted.length };
}

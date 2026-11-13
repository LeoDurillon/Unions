// A comment typed in Union as Notion rich text: links, **bold**, `code` and mentions become Notion's, the rest stays.

import { MENTION_TOKEN } from './tracker-mention';

/** One text object as Notion takes it in a comment. */
type NotionTextInput = {
  type: 'text';
  text: { content: string; link: { url: string } | null };
  annotations: { bold: boolean; code: boolean };
};

/** A person tagged: Notion shows `@Name` and notifies them. */
type NotionMentionInput = { type: 'mention'; mention: { type: 'user'; user: { id: string } } };

/** One rich text object of a comment, as Notion takes it. */
export type NotionRichTextInput = NotionTextInput | NotionMentionInput;

/** Notion refuses a text object longer than this. */
const MAX_TEXT_OBJECT = 2000;
/** Notion refuses a rich text array longer than this. */
export const MAX_TEXT_OBJECTS = 100;

const MARKS = new RegExp(
  `${MENTION_TOKEN.source}|\\[(?<label>[^\\]\\n]+)\\]\\((?<url>https?:\\/\\/[^\\s)]+)\\)|\\*\\*(?<bold>[^*\\n]+)\\*\\*|\`(?<code>[^\`\\n]+)\``,
  'gu',
);

type Run = { content: string; url: string | null; bold: boolean; code: boolean };

function plainRun(content: string): Run {
  return { content, url: null, bold: false, code: false };
}

function runOf(groups: Record<string, string | undefined>): Run {
  const { label, url, bold, code } = groups;
  if (label !== undefined && url !== undefined) {
    return { ...plainRun(label), url };
  }
  if (bold !== undefined) {
    return { ...plainRun(bold), bold: true };
  }
  return { ...plainRun(code ?? ''), code: true };
}

function textObjects(run: Run): NotionTextInput[] {
  const objects: NotionTextInput[] = [];
  for (let start = 0; start < run.content.length; start += MAX_TEXT_OBJECT) {
    objects.push({
      type: 'text',
      text: {
        content: run.content.slice(start, start + MAX_TEXT_OBJECT),
        link: run.url === null ? null : { url: run.url },
      },
      annotations: { bold: run.bold, code: run.code },
    });
  }
  return objects;
}

function objectsOf(groups: Record<string, string | undefined>): NotionRichTextInput[] {
  const { id } = groups;
  if (id !== undefined) {
    return [{ type: 'mention', mention: { type: 'user', user: { id } } }];
  }
  return textObjects(runOf(groups));
}

/** The text as Notion rich text; longer runs are split at Notion's 2000 characters. */
export function toRichText(text: string): NotionRichTextInput[] {
  const objects: NotionRichTextInput[] = [];
  let last = 0;
  for (const match of text.matchAll(MARKS)) {
    if (match.index > last) {
      objects.push(...textObjects(plainRun(text.slice(last, match.index))));
    }
    objects.push(...objectsOf(match.groups ?? {}));
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    objects.push(...textObjects(plainRun(text.slice(last))));
  }
  return objects;
}

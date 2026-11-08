// A comment typed in Union as Notion rich text: markdown links, **bold** and `code` become marks, the rest stays as typed.

/** One text object as Notion takes it in a comment. */
export type NotionRichTextInput = {
  type: 'text';
  text: { content: string; link: { url: string } | null };
  annotations: { bold: boolean; code: boolean };
};

/** Notion refuses a text object longer than this. */
const MAX_TEXT_OBJECT = 2000;
/** Notion refuses a rich text array longer than this. */
export const MAX_TEXT_OBJECTS = 100;

const MARKS =
  /\[(?<label>[^\]\n]+)\]\((?<url>https?:\/\/[^\s)]+)\)|\*\*(?<bold>[^*\n]+)\*\*|`(?<code>[^`\n]+)`/gu;

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

function runsOf(text: string): Run[] {
  const runs: Run[] = [];
  let last = 0;
  for (const match of text.matchAll(MARKS)) {
    if (match.index > last) {
      runs.push(plainRun(text.slice(last, match.index)));
    }
    runs.push(runOf(match.groups ?? {}));
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    runs.push(plainRun(text.slice(last)));
  }
  return runs;
}

function objectsOf(run: Run): NotionRichTextInput[] {
  const objects: NotionRichTextInput[] = [];
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

/** The text as Notion rich text; longer runs are split at Notion's 2000 characters. */
export function toRichText(text: string): NotionRichTextInput[] {
  return runsOf(text).flatMap((run) => objectsOf(run));
}

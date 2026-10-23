// Notion's page markdown (`GET /v1/pages/{id}/markdown`) as plain GitHub-flavored markdown: its own
// tags (mentions, link previews, callouts, colored or commented spans, toggles) become what any
// renderer, GitHub and the agents read. Browser-safe: the panel also cleans tickets imported before
// this existed. Idempotent: clean markdown goes through unchanged.

/** `{toggle="true"}`, `{color="blue"}` at the end of a line: Notion block attributes. */
const BLOCK_ATTRIBUTES = /\s*\{(?:[a-z_]+="[^"]*"\s*)+\}\s*$/u;
const MENTION = /<mention-(?<kind>[a-z]+)\b(?<attributes>[^>]*?)\/?>(?:<\/mention-\k<kind>>)?/gu;
const LINK_PREVIEW = /<link-preview\b(?<attributes>[^>]*?)\/?>(?:<\/link-preview>)?/gu;
const SPAN = /<span\b[^>]*>(?<inner>[\s\S]*?)<\/span>/gu;
const STRAY_TAGS = /<\/?(?:empty-block|columns|column)\b[^>]*>/gu;
const CALLOUT_OPEN = /^<callout\b(?<attributes>[^>]*)>\s*$/u;
const TOGGLE_ATTRIBUTE = /\{[^}]*toggle="true"[^}]*\}\s*$/u;

function attribute(attributes: string, name: string): string | null {
  return new RegExp(`\\b${name}="([^"]*)"`, 'u').exec(attributes)?.[1] ?? null;
}

/** A mention as text: a link to what it points to, or its date. */
function mentionText(kind: string, attributes: string, titles: Record<string, string>): string {
  const url = attribute(attributes, 'url');
  if (url) {
    const label = titles[url] ?? (kind === 'page' ? 'Notion page' : `Notion ${kind}`);
    return `[${label}](${url})`;
  }
  const start = attribute(attributes, 'start');
  if (start) {
    const end = attribute(attributes, 'end');
    return end ? `${start} → ${end}` : start;
  }
  return '';
}

/** A link preview (a Figma file, a video…) as its plain link: `source` is the link, `url` the block. */
function linkPreviewText(attributes: string): string {
  const link = attribute(attributes, 'source') ?? attribute(attributes, 'url') ?? '';
  return link.replaceAll('&amp;', '&');
}

function isGroups(value: unknown): value is Record<string, string | undefined> {
  return typeof value === 'object' && value !== null;
}

function inline(line: string, titles: Record<string, string>): string {
  let text = line.replaceAll(MENTION, (...match: unknown[]) => {
    const groups = match.at(-1);
    return isGroups(groups) ? mentionText(groups.kind ?? '', groups.attributes ?? '', titles) : '';
  });
  text = text.replaceAll(LINK_PREVIEW, (...match: unknown[]) => {
    const groups = match.at(-1);
    return isGroups(groups) ? linkPreviewText(groups.attributes ?? '') : '';
  });
  // Spans nest when Notion marks a commented range inside a colored one.
  for (let previous = ''; previous !== text;) {
    previous = text;
    text = text.replaceAll(SPAN, (...match: unknown[]) => {
      const groups = match.at(-1);
      return isGroups(groups) ? (groups.inner ?? '') : '';
    });
  }
  return text.replaceAll(STRAY_TAGS, '').replace(BLOCK_ATTRIBUTES, '');
}

function dedent(line: string): string {
  return line.startsWith('\t') ? line.slice(1) : line.replace(/^ {1,4}/u, '');
}

/** A callout's tab-indented lines as a quote, the icon before the first. */
function callout(attributes: string, body: string[]): string[] {
  const icon = attribute(attributes, 'icon');
  const lines = body.map((line) => dedent(line));
  if (icon && lines.length > 0) {
    lines[0] = `${icon} ${lines[0] ?? ''}`;
  }
  return lines.map((line) => (line.trim() === '' ? '>' : `> ${line}`));
}

/**
 * The lines indented under a line (a toggle's children): Notion indents them with a tab, which
 * markdown would read as code after a heading.
 */
function childrenOf(lines: string[], from: number): number {
  let end = from;
  while (end < lines.length && (lines[end]?.startsWith('\t') === true || lines[end] === '')) {
    end += 1;
  }
  return end;
}

/** A callout from `index` (its opening line) to its `</callout>`: the quote, and the line after it. */
function calloutAt(
  lines: string[],
  index: number,
  attributes: string,
  titles: Record<string, string>,
): { out: string[]; next: number } {
  const close = lines.findIndex((item, at) => at > index && item.trim() === '</callout>');
  const end = close === -1 ? lines.length : close;
  const out = callout(attributes, lines.slice(index + 1, end)).map((item) => inline(item, titles));
  return { out, next: end + 1 };
}

/** A line, and the children of a toggle on it (dedented): what it adds, and the line after them. */
function lineAt(
  lines: string[],
  index: number,
  titles: Record<string, string>,
): { out: string[]; next: number } {
  const line = lines[index] ?? '';
  if (!TOGGLE_ATTRIBUTE.test(line) || line.startsWith('\t')) {
    return { out: [inline(line, titles)], next: index + 1 };
  }
  const end = childrenOf(lines, index + 1);
  const children = lines.slice(index + 1, end).map((item) => inline(dedent(item), titles));
  return { out: [inline(line, titles), ...children], next: end };
}

export function notionMarkdown(markdown: string, titles: Record<string, string> = {}): string {
  const lines = markdown.split('\n');
  const out: string[] = [];
  let index = 0;
  while (index < lines.length) {
    const opened = CALLOUT_OPEN.exec((lines[index] ?? '').trim());
    const part = opened
      ? calloutAt(lines, index, opened.groups?.attributes ?? '', titles)
      : lineAt(lines, index, titles);
    out.push(...part.out);
    ({ next: index } = part);
  }
  return out.join('\n');
}

/** The pages a markdown mentions, to look their titles up before cleaning it. */
export function mentionedUrls(markdown: string): string[] {
  const urls = [...markdown.matchAll(MENTION)].map((match) =>
    attribute(match.groups?.attributes ?? '', 'url'),
  );
  return [...new Set(urls.filter((url): url is string => url !== null))];
}

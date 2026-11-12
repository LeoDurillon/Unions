// Notion's file, PDF, video and audio blocks (`<file src="…">caption</file>`) as markdown links.
// Named by their caption, else the file's name; browser-safe.

/** `src` in Notion's enhanced markdown (v1), `source` in Notion-flavored markdown (v2). */
const MEDIA =
  /<(?<tag>file|pdf|video|audio)\b(?<attributes>[^>]*?)(?:\/>|>(?<caption>[\s\S]*?)<\/\k<tag>>)/gu;
const URL_ATTRIBUTE = /\b(?:src|source)="(?<url>[^"]*)"/u;

const LABELS: Record<string, string> = {
  file: 'Notion file',
  pdf: 'Notion PDF',
  video: 'Notion video',
  audio: 'Notion audio',
};

/** The last segment of the link's path, decoded: Notion keeps the uploaded file's name there. */
export function fileNameOfUrl(url: string): string {
  if (!URL.canParse(url)) {
    return '';
  }
  const segment = new URL(url).pathname.split('/').at(-1) ?? '';
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** A link a markdown parser reads to its end: no spaces nor parentheses left bare. */
function linkTarget(url: string): string {
  return url.replaceAll(' ', '%20').replaceAll('(', '%28').replaceAll(')', '%29');
}

function linkText(text: string): string {
  return text
    .replaceAll(/\s+/gu, ' ')
    .replaceAll('[', String.raw`\[`)
    .replaceAll(']', String.raw`\]`)
    .trim();
}

function mediaLink(tag: string, attributes: string, caption: string): string {
  const url = (URL_ATTRIBUTE.exec(attributes)?.groups?.url ?? '').replaceAll('&amp;', '&');
  const label = caption.trim() || fileNameOfUrl(url) || (LABELS[tag] ?? 'Notion file');
  return url === '' ? linkText(label) : `[${linkText(label)}](${linkTarget(url)})`;
}

/** The line with each of Notion's media tags as a markdown link. */
export function notionMediaLinks(line: string): string {
  return line.replaceAll(MEDIA, (...match: unknown[]) => {
    const groups = match.at(-1);
    if (typeof groups !== 'object' || groups === null) {
      return '';
    }
    const found: Record<string, unknown> = { ...groups };
    const text = (key: string): string => (typeof found[key] === 'string' ? found[key] : '');
    return mediaLink(text('tag'), text('attributes'), text('caption'));
  });
}

// The Notion pages a text links to (a pull request's description), for the review's link suggestions.
import { parseNotionId } from './notion-id';

const URL_IN_TEXT = /https?:\/\/[^\s<>()[\]"'`]+/giu;

function isNotionHost(host: string): boolean {
  return (
    host === 'notion.so' ||
    host.endsWith('.notion.so') ||
    host.endsWith('.notion.site') ||
    host === 'notion.com' ||
    host.endsWith('.notion.com')
  );
}

/** Each Notion page the text links to once, by its id, with the first URL naming it. */
export function notionUrlsIn(text: string): { id: string; url: string }[] {
  const found = new Map<string, string>();
  for (const [match] of text.matchAll(URL_IN_TEXT)) {
    const url = match.replace(/[.,;:!?]+$/u, '');
    const host = URL.canParse(url) ? new URL(url).hostname.toLowerCase() : '';
    const id = isNotionHost(host) ? parseNotionId(url) : null;
    if (id && !found.has(id)) {
      found.set(id, url);
    }
  }
  return [...found].map(([id, url]) => ({ id, url }));
}

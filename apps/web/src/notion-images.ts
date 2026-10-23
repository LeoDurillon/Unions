// Downloads the images a Notion page shows (their links expire within the hour) so they can be kept
// as the ticket's files: each kept one is referenced as `attachment:<name>` in the markdown.
import { MAX_ATTACHMENT_BYTES, MAX_TICKET_ATTACHMENT_BYTES } from '@union/core';

const IMAGE = /!\[(?<alt>[^\]]*)\]\((?<url>https:\/\/[^)\s]+)\)/gu;
const FETCH_TIMEOUT_MS = 20_000;
const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

export type NotionImage = { name: string; bytes: Uint8Array; contentType: string };

/** Notion serves a page's files from its own S3 bucket, behind links signed for an hour. */
function isNotionFile(url: string): boolean {
  const { hostname, protocol } = new URL(url);
  return (
    protocol === 'https:' &&
    ((hostname.startsWith('prod-files-secure.s3.') && hostname.endsWith('.amazonaws.com')) ||
      hostname === 'file.notion.so')
  );
}

async function download(
  url: string,
  fetchFn: typeof fetch,
): Promise<Omit<NotionImage, 'name'> | null> {
  try {
    const response = await fetchFn(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    const contentType = (response.headers.get('content-type') ?? '').split(';')[0]?.trim() ?? '';
    if (!response.ok || !(contentType in EXTENSIONS)) {
      return null;
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    return bytes.byteLength > MAX_ATTACHMENT_BYTES ? null : { bytes, contentType };
  } catch {
    return null;
  }
}

/**
 * Downloads the images a Notion page shows (their links expire within the hour) so they can be kept
 * as the ticket's files: each kept one is referenced as `attachment:<name>` in the markdown. An image
 * that cannot be fetched, or would pass the ticket's limit, keeps its link.
 */
export async function fetchNotionImages(
  markdown: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ markdown: string; images: NotionImage[] }> {
  const links = [
    ...new Set([...markdown.matchAll(IMAGE)].map((match) => match.groups?.url ?? '')),
  ].filter((url) => URL.canParse(url) && isNotionFile(url));
  const fetched = await Promise.all(links.map((url) => download(url, fetchFn)));
  const images: NotionImage[] = [];
  const names = new Map<string, string>();
  let total = 0;
  for (const [index, image] of fetched.entries()) {
    const url = links[index];
    if (image && url && total + image.bytes.byteLength <= MAX_TICKET_ATTACHMENT_BYTES) {
      total += image.bytes.byteLength;
      const name = `notion-image-${images.length + 1}.${EXTENSIONS[image.contentType] ?? 'img'}`;
      images.push({ name, ...image });
      names.set(url, name);
    }
  }
  return {
    markdown: markdown.replaceAll(IMAGE, (...match: unknown[]) => {
      const groups = match.at(-1);
      const found = typeof groups === 'object' && groups !== null ? groups : {};
      const alt = 'alt' in found && typeof found.alt === 'string' ? found.alt : '';
      const url = 'url' in found && typeof found.url === 'string' ? found.url : '';
      const name = names.get(url);
      return name ? `![${alt === '' ? name : alt}](attachment:${name})` : String(match[0]);
    }),
    images,
  };
}

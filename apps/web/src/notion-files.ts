// Downloads the images and files a Notion page holds (their links expire within the hour) so they can be
// kept as the ticket's files: each kept one is referenced as `attachment:<name>` in the markdown.
import {
  fileNameOfUrl,
  MAX_ATTACHMENT_BYTES,
  MAX_TICKET_ATTACHMENT_BYTES,
  safeFileName,
} from '@union/core';

/** `![alt](url)` or `[text](url)`, the text allowed to hold escaped brackets. */
const LINK = /(?<bang>!?)\[(?<text>(?:\\.|[^\]\\])*)\]\((?<url>https:\/\/[^)\s]+)\)/gu;
const IMAGE_TIMEOUT_MS = 20_000;
const FILE_TIMEOUT_MS = 90_000;
const PARALLEL_DOWNLOADS = 4;
const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};
const DISPOSITION_NAME = /filename\*=UTF-8''(?<encoded>[^;]+)|filename="?(?<plain>[^";]+)"?/iu;

export type NotionFile = { name: string; bytes: Uint8Array; contentType: string; image: boolean };
type Found = { url: string; image: boolean };
type Downloaded = { bytes: Uint8Array; contentType: string; fileName: string };

/** Notion serves a page's files from its own S3 bucket, behind links signed for an hour. */
function isNotionFile(url: string): boolean {
  const { hostname, protocol } = new URL(url);
  return (
    protocol === 'https:' &&
    ((hostname.startsWith('prod-files-secure.s3.') && hostname.endsWith('.amazonaws.com')) ||
      hostname === 'file.notion.so')
  );
}

function dispositionName(header: string | null): string {
  const groups = DISPOSITION_NAME.exec(header ?? '')?.groups;
  if (groups?.encoded) {
    try {
      return decodeURIComponent(groups.encoded);
    } catch {
      return groups.encoded;
    }
  }
  return groups?.plain ?? '';
}

function tooLarge(response: Response): boolean {
  return Number(response.headers.get('content-length') ?? 0) > MAX_ATTACHMENT_BYTES;
}

async function download(found: Found, fetchFn: typeof fetch): Promise<Downloaded | null> {
  const timeout = found.image ? IMAGE_TIMEOUT_MS : FILE_TIMEOUT_MS;
  try {
    const response = await fetchFn(found.url, { signal: AbortSignal.timeout(timeout) });
    const contentType = (response.headers.get('content-type') ?? '').split(';')[0]?.trim() ?? '';
    const refused = found.image && !(contentType in IMAGE_EXTENSIONS);
    if (!response.ok || refused || tooLarge(response)) {
      await response.body?.cancel();
      return null;
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    const fileName = dispositionName(response.headers.get('content-disposition'));
    return bytes.byteLength > MAX_ATTACHMENT_BYTES ? null : { bytes, contentType, fileName };
  } catch {
    return null;
  }
}

/** Each link downloaded, at most `PARALLEL_DOWNLOADS` at a time, the results in order. */
async function downloadAll(links: Found[], fetchFn: typeof fetch): Promise<(Downloaded | null)[]> {
  const results: (Downloaded | null)[] = [];
  let next = 0;
  const lane = async (): Promise<void> => {
    for (let link = links[next]; link; link = links[next]) {
      const index = next;
      next += 1;
      // oxlint-disable-next-line no-await-in-loop -- a lane downloads one file after the other
      results[index] = await download(link, fetchFn);
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL_DOWNLOADS, links.length) }, lane));
  return results;
}

/** The page's Notion-hosted links, once each: images first (they show in the text), then files. */
function notionLinks(markdown: string): Found[] {
  const found = new Map<string, boolean>();
  for (const match of markdown.matchAll(LINK)) {
    const url = match.groups?.url ?? '';
    if (URL.canParse(url) && isNotionFile(url)) {
      found.set(url, found.get(url) === true || match.groups?.bang === '!');
    }
  }
  const links = [...found].map(([url, image]) => ({ url, image }));
  return [...links.filter((link) => link.image), ...links.filter((link) => !link.image)];
}

/** A name safe to store and to write as a link target: no spaces nor parentheses, unique. */
function keptName(found: Found, file: Downloaded, taken: Set<string>, images: number): string {
  const wanted = found.image
    ? `notion-image-${images + 1}.${IMAGE_EXTENSIONS[file.contentType] ?? 'img'}`
    : file.fileName || fileNameOfUrl(found.url) || 'notion-file';
  const base = safeFileName(wanted).replaceAll(/[ ()]/gu, '_');
  const dot = base.lastIndexOf('.');
  const [stem, extension] = dot > 0 ? [base.slice(0, dot), base.slice(dot)] : [base, ''];
  let name = base;
  for (let count = 2; taken.has(name); count += 1) {
    name = `${stem}-${count}${extension}`;
  }
  taken.add(name);
  return name;
}

/** The downloaded files that fit the ticket's limit, and the name each link's file is kept as. */
function keep(
  links: Found[],
  fetched: (Downloaded | null)[],
): { files: NotionFile[]; names: Map<string, string> } {
  const files: NotionFile[] = [];
  const names = new Map<string, string>();
  const taken = new Set<string>();
  let total = 0;
  for (const [index, file] of fetched.entries()) {
    const found = links[index];
    if (file && found && total + file.bytes.byteLength <= MAX_TICKET_ATTACHMENT_BYTES) {
      total += file.bytes.byteLength;
      const images = files.filter((kept) => kept.image).length;
      const name = keptName(found, file, taken, images);
      const contentType = file.contentType || 'application/octet-stream';
      files.push({ name, bytes: file.bytes, contentType, image: found.image });
      names.set(found.url, name);
    }
  }
  return { files, names };
}

function groupText(groups: unknown, key: string): string {
  const found: Record<string, unknown> =
    typeof groups === 'object' && groups !== null ? { ...groups } : {};
  const value = found[key];
  return typeof value === 'string' ? value : '';
}

/**
 * Downloads the images and files a Notion page holds (their links expire within the hour) so they
 * can be kept as the ticket's files: each kept one is referenced as `attachment:<name>` in the
 * markdown. Images come first; one that cannot be fetched, or would pass the ticket's limit, keeps
 * its link.
 */
export async function fetchNotionFiles(
  markdown: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ markdown: string; files: NotionFile[] }> {
  const links = notionLinks(markdown);
  const { files, names } = keep(links, await downloadAll(links, fetchFn));
  return {
    markdown: markdown.replaceAll(LINK, (...match: unknown[]) => {
      const groups = match.at(-1);
      const name = names.get(groupText(groups, 'url'));
      const text = groupText(groups, 'text');
      return name
        ? `${groupText(groups, 'bang')}[${text === '' ? name : text}](attachment:${name})`
        : String(match[0]);
    }),
    files,
  };
}

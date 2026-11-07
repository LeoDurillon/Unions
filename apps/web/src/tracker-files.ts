// Downloads the images and files a tracker item links (a Notion page, a Jira issue) so they are kept as the
// ticket's files: each kept one is referenced as `attachment:<name>` in the markdown. Each tracker gives its source.
import {
  fileNameOfUrl,
  MAX_ATTACHMENT_BYTES,
  MAX_TICKET_ATTACHMENT_BYTES,
  safeFileName,
} from '@union/core';

/** `![alt](url)` or `[text](url)`, the text allowed to hold escaped brackets. */
const LINK = /(?<bang>!?)\[(?<text>(?:\\.|[^\]\\])*)\]\((?<url>https:\/\/[^)\s]+)\)/gu;
const ESCAPED = /\\(?<character>.)/gu;
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

export type TrackerFile = { name: string; bytes: Uint8Array; contentType: string; image: boolean };

/** Where a tracker keeps an item's files, and how to get one. */
export type FileSource = {
  /** A link to one of the item's files (only those are downloaded). */
  isFile: (url: string) => boolean;
  /** Fetches a file's link (with the tracker's credentials, if it needs them). */
  get: (url: string, signal: AbortSignal, fetchFn: typeof fetch) => Promise<Response>;
  /** Names images `<prefix>-image-<n>` (their own names are meaningless) rather than by their text. */
  imagePrefix: string | null;
  /** Names a file by its link's text when the download gives no name (Jira's is the file name). */
  nameFromText: boolean;
  /** A file's name when nothing gives one. */
  fallbackName: string;
};

type Found = { url: string; image: boolean; text: string };
type Downloaded = { bytes: Uint8Array; contentType: string; fileName: string };

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

async function download(
  found: Found,
  source: FileSource,
  fetchFn: typeof fetch,
): Promise<Downloaded | null> {
  const timeout = found.image ? IMAGE_TIMEOUT_MS : FILE_TIMEOUT_MS;
  try {
    const response = await source.get(found.url, AbortSignal.timeout(timeout), fetchFn);
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
async function downloadAll(
  links: Found[],
  source: FileSource,
  fetchFn: typeof fetch,
): Promise<(Downloaded | null)[]> {
  const results: (Downloaded | null)[] = [];
  let next = 0;
  const lane = async (): Promise<void> => {
    for (let link = links[next]; link; link = links[next]) {
      const index = next;
      next += 1;
      // oxlint-disable-next-line no-await-in-loop -- a lane downloads one file after the other
      results[index] = await download(link, source, fetchFn);
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL_DOWNLOADS, links.length) }, lane));
  return results;
}

/** A link seen again: an image once shown as one, named by its first text. */
function merged(known: Found | undefined, link: Found): Found {
  if (!known) {
    return link;
  }
  return {
    url: link.url,
    image: known.image || link.image,
    text: known.text === '' ? link.text : known.text,
  };
}

/** The item's file links, once each: images first (they show in the text), then files. */
function fileLinks(markdown: string, source: FileSource): Found[] {
  const found = new Map<string, Found>();
  for (const match of markdown.matchAll(LINK)) {
    const url = match.groups?.url ?? '';
    if (URL.canParse(url) && source.isFile(url)) {
      const image = match.groups?.bang === '!';
      const text = (match.groups?.text ?? '').replaceAll(ESCAPED, '$<character>');
      found.set(url, merged(found.get(url), { url, image, text }));
    }
  }
  const links = [...found.values()];
  return [...links.filter((link) => link.image), ...links.filter((link) => !link.image)];
}

function wantedName(found: Found, file: Downloaded, source: FileSource, images: number): string {
  if (found.image && source.imagePrefix !== null) {
    return `${source.imagePrefix}-image-${images + 1}.${IMAGE_EXTENSIONS[file.contentType] ?? 'img'}`;
  }
  const text = source.nameFromText ? found.text : '';
  return file.fileName || text || fileNameOfUrl(found.url) || source.fallbackName;
}

/** A name safe to store and to write as a link target: no spaces nor parentheses, unique. */
function keptName(wanted: string, taken: Set<string>): string {
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
  source: FileSource,
): { files: TrackerFile[]; names: Map<string, string> } {
  const files: TrackerFile[] = [];
  const names = new Map<string, string>();
  const taken = new Set<string>();
  let total = 0;
  for (const [index, file] of fetched.entries()) {
    const found = links[index];
    if (file && found && total + file.bytes.byteLength <= MAX_TICKET_ATTACHMENT_BYTES) {
      total += file.bytes.byteLength;
      const images = files.filter((kept) => kept.image).length;
      const name = keptName(wantedName(found, file, source, images), taken);
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
 * Downloads the images and files the markdown links from the source, so they can be kept as the
 * ticket's files: each kept one is referenced as `attachment:<name>`. Images come first; one that
 * cannot be fetched, or would pass the ticket's limit, keeps its link.
 */
export async function fetchTrackerFiles(
  markdown: string,
  source: FileSource,
  fetchFn: typeof fetch = fetch,
): Promise<{ markdown: string; files: TrackerFile[] }> {
  const links = fileLinks(markdown, source);
  const { files, names } = keep(links, await downloadAll(links, source, fetchFn), source);
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

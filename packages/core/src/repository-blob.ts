// How the Repository tab shows a file read from GitHub: text, an image, or only its size (binary, too large).

/** Files above this size are not read: the tab shows their size and a link to GitHub. */
export const REPOSITORY_FILE_LIMIT = 1_000_000;

/** A NUL byte in the first bytes of a file means binary, as git decides. */
const SNIFF_BYTES = 8000;

const IMAGE_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  svg: 'image/svg+xml',
};

/** One file as the tab shows it. */
export type RepositoryBlob =
  | { kind: 'text'; size: number; text: string }
  | { kind: 'image'; size: number; dataUrl: string }
  | { kind: 'binary'; size: number }
  | { kind: 'too-large'; size: number };

function imageType(path: string): string | null {
  const name = path.split('/').at(-1) ?? '';
  const extension = name.includes('.') ? (name.split('.').at(-1) ?? '').toLowerCase() : '';
  return IMAGE_TYPES[extension] ?? null;
}

function asText(bytes: Uint8Array): string | null {
  if (bytes.subarray(0, SNIFF_BYTES).includes(0)) {
    return null;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** The file's bytes as the tab shows them; the path only tells an image's type. */
export function repositoryBlob(path: string, bytes: Uint8Array): RepositoryBlob {
  const size = bytes.byteLength;
  if (size > REPOSITORY_FILE_LIMIT) {
    return { kind: 'too-large', size };
  }
  const type = imageType(path);
  if (type) {
    return {
      kind: 'image',
      size,
      dataUrl: `data:${type};base64,${Buffer.from(bytes).toString('base64')}`,
    };
  }
  const text = asText(bytes);
  return text === null ? { kind: 'binary', size } : { kind: 'text', size, text };
}

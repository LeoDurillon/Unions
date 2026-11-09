// The blocks Notion's page markdown cannot render (`<unknown url="…#block" alt="…"/>`, as a connected
// Figma preview reads), resolved to the link the block API gives them.

/** `<unknown url="https://app.notion.com/p/…#<block id>" alt="external_object_instance"/>` */
const UNKNOWN =
  /<unknown\b[^>]*?\burl="(?<url>[^"]*?#(?<block>[0-9a-f]{32}))"[^>]*?\/?>(?:<\/unknown>)?/gu;
/** Block types whose payload is a link to what they show. */
const LINKED_TYPES = new Set([
  'link_preview',
  'embed',
  'bookmark',
  'video',
  'pdf',
  'file',
  'image',
]);
/** A page holds a handful of these at most; past this, the rest keep their Notion link. */
const MAX_RESOLVED_BLOCKS = 20;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** The ids of the blocks a page's markdown could not render, in order, once each. */
export function unknownBlockIds(markdown: string): string[] {
  const ids = [...markdown.matchAll(UNKNOWN)].map((match) => match.groups?.block ?? '');
  return [...new Set(ids.filter((id) => id !== ''))];
}

/** The link a block (`GET /v1/blocks/{id}`) shows: a link preview's, an embed's, a bookmark's… */
export function blockLinkOf(block: unknown): string | null {
  if (!isRecord(block) || typeof block.type !== 'string' || !LINKED_TYPES.has(block.type)) {
    return null;
  }
  const payload = block[block.type];
  if (!isRecord(payload)) {
    return null;
  }
  const hosted = payload.external ?? payload.file;
  const url = payload.url ?? (isRecord(hosted) ? hosted.url : undefined);
  return typeof url === 'string' && url !== '' ? url : null;
}

/**
 * Each unrendered block as its link when known, else as a plain link to the block in Notion (so no
 * raw tag reaches a ticket). Idempotent.
 */
export function withBlockLinks(markdown: string, links: Record<string, string> = {}): string {
  return markdown.replaceAll(UNKNOWN, (...match: unknown[]) => {
    const groups = match.at(-1);
    if (!isRecord(groups) || typeof groups.url !== 'string' || typeof groups.block !== 'string') {
      return '';
    }
    return links[groups.block] ?? `[Notion block](${groups.url})`;
  });
}

/** Reads the unrendered blocks of a markdown (best effort: one that fails keeps its Notion link). */
export async function resolveUnknownBlocks(
  markdown: string,
  readBlock: (blockId: string) => Promise<unknown>,
): Promise<string> {
  const found = await Promise.all(
    unknownBlockIds(markdown)
      .slice(0, MAX_RESOLVED_BLOCKS)
      .map(async (id) => [id, blockLinkOf(await readBlock(id).catch(() => null))] as const),
  );
  const links = found.flatMap(([id, link]) => (link === null ? [] : [[id, link] as const]));
  return withBlockLinks(markdown, Object.fromEntries(links));
}

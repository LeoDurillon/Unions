// A new ticket's origin (the tracker item it is imported from), and that item's images kept as the ticket's files.
import {
  integrationKind,
  isIntegrationKindName,
  type IntegrationKindName,
  type TicketOrigin,
} from '@union/core';

import { BAD_REQUEST, fail } from '../http';
import { fetchNotionImages, type NotionImage } from '../notion-images';

type WithImages = { markdown: string; images: NotionImage[] };

/** Each kind's images, downloaded before the ticket exists: their links may expire (Notion's within the hour). */
const IMAGES: Record<IntegrationKindName, (markdown: string) => Promise<WithImages>> = {
  notion: (markdown) => fetchNotionImages(markdown),
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** An https link, normalized; null for anything else (the panel shows it as a link). */
function httpsUrl(value: unknown): string | null {
  const url = typeof value === 'string' && URL.canParse(value) ? new URL(value) : null;
  return url?.protocol === 'https:' ? url.href : null;
}

/** `origin: { kind, id, url }` of the body; null without one. */
export function originOf(body: Record<string, unknown>): TicketOrigin | null {
  const { origin } = body;
  if (origin === undefined || origin === null) {
    return null;
  }
  const kindName = isRecord(origin) && typeof origin.kind === 'string' ? origin.kind : '';
  if (!isRecord(origin) || !isIntegrationKindName(kindName)) {
    throw fail(BAD_REQUEST, `Unknown origin: ${kindName}`);
  }
  const kind = integrationKind(kindName);
  const id = typeof origin.id === 'string' ? kind.parseRef(origin.id) : null;
  if (!id) {
    throw fail(BAD_REQUEST, `That is not a ${kind.label} ${kind.itemLabel} ID`);
  }
  const url = httpsUrl(origin.url);
  if (!url) {
    throw fail(BAD_REQUEST, `Give the ${kind.label} ${kind.itemLabel}'s https link`);
  }
  return { kind: kindName, id, url };
}

/** The text with the origin's images as the ticket's files; unchanged without an origin. */
export async function withOriginImages(
  origin: TicketOrigin | null,
  text: string,
): Promise<WithImages & { note: string }> {
  if (!origin) {
    return { markdown: text, images: [], note: '' };
  }
  const { label, itemLabel } = integrationKind(origin.kind);
  return { ...(await IMAGES[origin.kind](text)), note: `An image of the ${label} ${itemLabel}` };
}

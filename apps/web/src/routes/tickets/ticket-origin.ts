// A new ticket's origin (the tracker item it is imported from), and that item's images and files kept as the ticket's.

import {
  integrationKind,
  integrationOf,
  isIntegrationKindName,
  jiraConfigOf,
  type Db,
  type IntegrationKindName,
  type TicketOrigin,
} from '@union/core';

import { BAD_REQUEST, fail } from '../../http';
import { fetchJiraFiles } from '../../jira-files';
import { fetchNotionFiles } from '../../notion-files';
import type { TrackerFile } from '../../tracker-files';

/** A file of the tracker item, with the note it is kept with. */
type OriginFile = { name: string; bytes: Uint8Array; contentType: string; note: string };
type WithFiles = { markdown: string; files: TrackerFile[] };
/** The project's integration of the origin's kind: what a tracker whose files need credentials reads them with. */
type Access = { secret: string; config: unknown };

/**
 * Each kind's images and files, downloaded before the ticket exists: their links may expire (Notion's
 * within the hour), or need the integration's token (Jira's). Without an integration, links stay.
 */
const FILES: Record<
  IntegrationKindName,
  (markdown: string, access: Access | null) => Promise<WithFiles>
> = {
  notion: (markdown) => fetchNotionFiles(markdown),
  jira: (markdown, access) =>
    access === null
      ? Promise.resolve({ markdown, files: [] })
      : fetchJiraFiles(markdown, { secret: access.secret, config: jiraConfigOf(access.config) }),
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

/** The text with the origin's images and files as the ticket's files; unchanged without an origin. */
export async function withOriginFiles(
  db: Db,
  projectId: number,
  origin: TicketOrigin | null,
  text: string,
): Promise<{ markdown: string; files: OriginFile[] }> {
  if (!origin) {
    return { markdown: text, files: [] };
  }
  const { label, itemLabel } = integrationKind(origin.kind);
  const { markdown, files } = await FILES[origin.kind](
    text,
    integrationOf(db, projectId, origin.kind),
  );
  return {
    markdown,
    files: files.map(({ image, name, bytes, contentType }) => ({
      name,
      bytes,
      contentType,
      note: `${image ? 'An image' : 'A file'} of the ${label} ${itemLabel}`,
    })),
  };
}

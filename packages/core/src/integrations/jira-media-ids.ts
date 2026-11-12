// Which attachment a description's file card shows, when the card names it only by its Media
// Services id. The ids are read from Jira, for the issues whose text has such a card.
import { adfNodeOf, type AdfNode } from './adf-node';
import type { JiraApi, JiraAuth } from './jira-api';
import type { JiraIssue } from './jira-parse';

/** Lookups at once: each is one small request to the site. */
const PARALLEL_LOOKUPS = 4;
/** An issue with more attachments than this keeps the rest listed under Attachments. */
const MAX_LOOKUPS = 30;

function mediaNodes(node: AdfNode): AdfNode[] {
  const own = node.type === 'media' || node.type === 'mediaInline' ? [node] : [];
  return [...own, ...node.content.flatMap((child) => mediaNodes(child))];
}

/** The description shows a file its name does not match (a file card has an id, no name). */
export function hasUnnamedMedia(issue: JiraIssue): boolean {
  const root = adfNodeOf(issue.description);
  if (root === null) {
    return false;
  }
  const names = new Set(issue.attachments.map((attachment) => attachment.filename));
  return mediaNodes(root).some((node) => {
    const { alt } = node.attrs;
    return typeof alt !== 'string' || !names.has(alt);
  });
}

/** Each attachment's Media Services id → the attachment's id; a lookup that fails is left out. */
export async function attachmentsByMediaId(
  jira: JiraApi,
  auth: JiraAuth,
  issue: JiraIssue,
): Promise<Map<string, string>> {
  const pending = issue.attachments.slice(0, MAX_LOOKUPS);
  const found = new Map<string, string>();
  const lane = async (): Promise<void> => {
    for (let attachment = pending.shift(); attachment; attachment = pending.shift()) {
      // oxlint-disable-next-line no-await-in-loop -- a lane asks for one attachment after the other
      const mediaId = await jira.attachmentMediaId(auth, attachment.id).catch(() => null);
      if (mediaId !== null) {
        found.set(mediaId, attachment.id);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL_LOOKUPS, pending.length) }, lane));
  return found;
}

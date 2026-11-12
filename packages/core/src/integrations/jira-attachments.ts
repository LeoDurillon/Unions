// A Jira issue's description as markdown with its attachments as links. Images and files in the
// text are matched to the issue's attachments by file name, the others listed at the end. The web
// downloads those links as ticket files.
import { adfMarkdown } from './adf-markdown';
import type { AdfMedia } from './adf-node';
import type { JiraIssue } from './jira-parse';

/** Images the ticket panel shows inline; other types (SVG, PDF) are kept as files. */
const RASTER_IMAGES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const LINK_TEXT = /[[\]\\]/gu;

type Attachment = JiraIssue['attachments'][number];

/** Where the site serves an attachment's content (with the token; the web downloads it). */
function attachmentUrl(site: string, id: string): string {
  return `${site}/rest/api/3/attachment/content/${encodeURIComponent(id)}`;
}

function isImage(attachment: Attachment): boolean {
  return RASTER_IMAGES.has(attachment.mimeType);
}

function listed(site: string, attachment: Attachment): string {
  const name = attachment.filename.replaceAll(LINK_TEXT, (character) => `\\${character}`);
  const link = `[${name}](${attachmentUrl(site, attachment.id)})`;
  return `- ${isImage(attachment) ? `!${link}` : link}`;
}

/**
 * The description as markdown. A media node is matched to its attachment by its Media Services id
 * (`byMediaId`, read from Jira: a file card has nothing else), else by file name (Jira sets an
 * image's `alt` to it); an attachment nothing in the text shows is listed under "Attachments", so
 * every file reaches the ticket.
 */
export function issueMarkdown(
  issue: JiraIssue,
  site: string,
  byMediaId: ReadonlyMap<string, string> = new Map(),
): string {
  const byName = new Map<string, Attachment>();
  const byId = new Map(issue.attachments.map((attachment) => [attachment.id, attachment]));
  for (const attachment of issue.attachments) {
    if (!byName.has(attachment.filename)) {
      byName.set(attachment.filename, attachment);
    }
  }
  const shown = new Set<string>();
  const find = ({ id, alt }: AdfMedia): Attachment | undefined => {
    const attachmentId = id === null ? undefined : byMediaId.get(id.toLowerCase());
    return (
      (attachmentId === undefined ? undefined : byId.get(attachmentId)) ??
      (alt === null ? undefined : byName.get(alt))
    );
  };
  const media = (node: AdfMedia): { name: string; url: string; image: boolean } | null => {
    const attachment = find(node);
    if (!attachment) {
      return null;
    }
    shown.add(attachment.id);
    return {
      name: attachment.filename,
      url: attachmentUrl(site, attachment.id),
      image: isImage(attachment),
    };
  };
  const text = adfMarkdown(issue.description, { media });
  const others = issue.attachments.filter((attachment) => !shown.has(attachment.id));
  if (others.length === 0) {
    return text;
  }
  const list = others.map((attachment) => listed(site, attachment)).join('\n');
  return [text, `## Attachments\n\n${list}`].filter((part) => part !== '').join('\n\n');
}

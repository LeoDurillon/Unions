// A Jira issue's description as markdown with its attachments as links: images and files in the text matched to
// the issue's attachments by file name, the others listed at the end. The web downloads those links as ticket files.
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
 * The description as markdown. A media node is matched to the attachment of the same file name (Jira
 * sets a media node's `alt` to it); an attachment nothing in the text shows is listed under
 * "Attachments", so every file reaches the ticket.
 */
export function issueMarkdown(issue: JiraIssue, site: string): string {
  const byName = new Map<string, Attachment>();
  for (const attachment of issue.attachments) {
    if (!byName.has(attachment.filename)) {
      byName.set(attachment.filename, attachment);
    }
  }
  const shown = new Set<string>();
  const media = ({ alt }: AdfMedia): { name: string; url: string; image: boolean } | null => {
    const attachment = alt === null ? undefined : byName.get(alt);
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

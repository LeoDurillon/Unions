// ADF media nodes (an image or file in an issue's text) as links, through the caller's resolver.
import { type AdfContext, type AdfMedia, type AdfNode, stringAttr } from './adf-node';

const LINK_TEXT = /[[\]\\]/gu;

function mediaOf(node: AdfNode): AdfMedia {
  return {
    id: stringAttr(node.attrs, 'id'),
    alt: stringAttr(node.attrs, 'alt'),
    mediaType: stringAttr(node.attrs, 'type'),
  };
}

/** One media node: a link (an image's embed) when the resolver knows the file, else its name in italics. */
export function mediaMarkdown(node: AdfNode, context: AdfContext): string {
  const media = mediaOf(node);
  const link = context.media(media);
  if (link === null) {
    return `*${(media.alt ?? 'attachment').replaceAll(LINK_TEXT, (c) => `\\${c}`)}*`;
  }
  const name = link.name.replaceAll(LINK_TEXT, (c) => `\\${c}`);
  return `${link.image ? '!' : ''}[${name}](<${link.url}>)`;
}

/** A `mediaSingle` or `mediaGroup`: its media nodes, separated by spaces (a caption is dropped). */
export function mediaGroupMarkdown(node: AdfNode, context: AdfContext): string {
  return node.content
    .filter((child) => child.type === 'media')
    .map((child) => mediaMarkdown(child, context))
    .join(' ');
}

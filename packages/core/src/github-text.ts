// Browser-safe: the PR tab shows GitHub text with it, and the import stores it.

const HTML_COMMENT = /<!--[\s\S]*?-->/gu;
/** Layout tags GitHub renders and bots use (folds, quotes, images); their text is kept. */
const LAYOUT_TAG =
  /<\/?(?:details|summary|blockquote|dl|dd|dt|picture|source|img|br|hr|sub|sup|p|div|span|a|b|strong|i|em|table|thead|tbody|tr|th|td)(?:\s[^>]*)?\/?>/giu;
const BLANK_RUNS = /\n{3,}/gu;

/**
 * A GitHub comment body as plain markdown: HTML comments (bot markers) and layout tags are dropped,
 * since the app does not render raw HTML. Other `<...>` text, such as `Array<string>`, is left alone.
 */
export function githubText(body: string): string {
  return body
    .replace(HTML_COMMENT, '')
    .replace(LAYOUT_TAG, '\n')
    .replace(BLANK_RUNS, '\n\n')
    .trim();
}

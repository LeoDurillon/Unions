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

const TITLE_MAX = 120;
const IMAGE = /!\[[^\]]*\]\([^)]*\)/gu;
const LINK = /\[(?<text>[^\]]*)\]\([^)]*\)/gu;
const ALERT = /^\[!\w+\]$/u;
const LINE_MARKS = /^(?:[#>\s]|[-*+]\s|\d+\.\s)+/u;
const INLINE_MARKS = /\*\*|__|`/gu;
const RULE = /^[-=*_|:\s]+$/u;

function titleOf(line: string): string {
  return line
    .replace(IMAGE, '')
    .replace(LINK, '$<text>')
    .replace(LINE_MARKS, '')
    .replace(INLINE_MARKS, '')
    .trim();
}

/**
 * A comment in one line, for a folded card: its first line with words (an alert marker such as
 * `[!NOTE]`, a rule or an image alone does not count), without markdown marks, cut at 120 characters.
 */
export function githubTitle(body: string): string {
  const title =
    githubText(body)
      .split('\n')
      .map((line) => titleOf(line))
      .find((line) => line !== '' && !ALERT.test(line) && !RULE.test(line)) ?? '';
  return title.length > TITLE_MAX ? `${title.slice(0, TITLE_MAX - 1)}…` : title;
}

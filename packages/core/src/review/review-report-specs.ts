// The specs a report sends, cleaned (images out of the text, a spec another one holds sent once), and
// the key its quotes are matched by. Pure, browser-safe.
import type { ReportSpec } from './review-report-types';

const IMAGE = /!\[[^\]]*\]\([^)\s]*\)/gu;
/** Marks that come and go between a spec's markdown and the agent's quote of it. */
const MARKS = /[*_`\\"“”«»„]/gu;
/** The line Union ends a ticket imported from Notion with: not the spec's words. */
const IMPORTED = 'imported from notion: ';
/** Share of a spec's lines another spec must hold for it to be the same spec. */
const SAME_SHARE = 0.9;

/** Markdown images become `[image N]`: their links (often signed, short-lived) tell the agent nothing. */
export function withoutImages(text: string): string {
  let count = 0;
  return text.replaceAll(IMAGE, () => {
    count += 1;
    return `[image ${count}]`;
  });
}

/** A quote as the reviewer reads it: without markdown's escapes and bold marks. */
export function plainQuote(quote: string): string {
  return quote.replaceAll(/\\(?<mark>[\\`*_{}[\]()#+\-.!|])/gu, '$<mark>').replaceAll('**', '');
}

/** A text as quotes are compared: without markdown marks, escapes and quote signs, spaces squeezed, in lower case. */
export function quoteKey(text: string): string {
  return text
    .replaceAll(/[‘’]/gu, "'")
    .replaceAll(MARKS, '')
    .replaceAll(/\s+/gu, ' ')
    .trim()
    .toLowerCase();
}

/** The lines that carry words: no rule, no empty checkbox, no import note. */
function wordLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => quoteKey(line))
    .filter((line) => /[\p{L}\p{N}]/u.test(line) && !line.startsWith(IMPORTED));
}

function holds(other: readonly string[], own: readonly string[]): boolean {
  if (own.length === 0) {
    return false;
  }
  const lines = new Set(other);
  return own.filter((line) => lines.has(line)).length / own.length >= SAME_SHARE;
}

/**
 * The specs numbered from 1, images out of their text. A spec whose lines are (nearly) all in a longer
 * one, or in an earlier one as long, is kept `sameAs` it, without its text: it is not sent twice.
 */
export function distinctSpecs(specs: Omit<ReportSpec, 'id' | 'sameAs'>[]): ReportSpec[] {
  const texts = specs.map((spec) => withoutImages(spec.text));
  const lines = texts.map((text) => wordLines(text));
  const hostOf = lines.map((own, at) =>
    lines.findIndex(
      (other, j) =>
        j !== at &&
        (other.length > own.length || (other.length === own.length && j < at)) &&
        holds(other, own),
    ),
  );
  const root = (at: number): number => {
    const host = hostOf[at] ?? -1;
    return host === -1 ? at : root(host);
  };
  return specs.map((spec, at) => {
    const host = root(at);
    return host === at
      ? { ...spec, id: at + 1, text: texts[at] ?? '' }
      : { ...spec, id: at + 1, text: '', sameAs: host + 1 };
  });
}

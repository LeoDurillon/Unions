// The Jira issues a pull request names, by habit: keys (ABC-123) in its title, branch or description, and links of
// the project's site; only the project's own keys, so `UTF-8` or `SHA-256` are not taken for issues. Pure.
import { parseJiraKey } from './integrations/jira-config';

const KEY = /\b(?<key>[A-Za-z][A-Za-z0-9_]*-[1-9]\d*)\b/gu;
const LINK = /https:\/\/[^\s)>\]"']+/gu;
/** Punctuation that ends a sentence, not the link: "see https://…/browse/ABC-1, and". */
const TRAILING = /[.,;:!?]+$/u;

/** The keys of `projectKey` the texts name, once each, in the order they appear (links of other sites left out). */
export function jiraKeysIn(texts: readonly string[], projectKey: string, site: string): string[] {
  const prefix = `${projectKey.toUpperCase()}-`;
  const found: string[] = [];
  const add = (key: string | null): void => {
    if (key !== null && key.startsWith(prefix) && !found.includes(key)) {
      found.push(key);
    }
  };
  for (const text of texts) {
    // Links and bare keys by where they are in the text, so keys come in the order the text names them.
    const atLinks = [...text.matchAll(LINK)].flatMap((match) =>
      match[0].startsWith(`${site}/`)
        ? [{ at: match.index, key: parseJiraKey(match[0].replace(TRAILING, '')) }]
        : [],
    );
    // Links blanked out to their length: a key inside one is read as the link's, at its place.
    const bare = text.replaceAll(LINK, (link) => ' '.repeat(link.length));
    const atKeys = [...bare.matchAll(KEY)].map((match) => ({
      at: match.index,
      key: match.groups?.key?.toUpperCase() ?? null,
    }));
    for (const { key } of [...atLinks, ...atKeys].toSorted((a, b) => a.at - b.at)) {
      add(key);
    }
  }
  return found;
}

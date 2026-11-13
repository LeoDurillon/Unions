// A person tagged in a comment typed in Union: the token `[@Name](mention:<id>)`, which each tracker sends as its mention.
// Browser-safe: the comment box inserts the token, the trackers' converters read it, and the panel shows it as `@Name`.

/** Someone a comment can tag: the tracker's id for them (a Notion user, a Jira account) and their name. */
export type TrackerPerson = { id: string; name: string };

/** The link scheme of a mention token. */
export const MENTION_SCHEME = 'mention:';

/** A mention token: its name (without the `@`) and its id. */
export const MENTION_TOKEN = /\[@(?<name>[^\]\n]+)\]\(mention:(?<id>[^\s)]+)\)/gu;

const UNSAFE_IN_NAME = /[[\]\n]/gu;

/** The token that tags `person`; a bracket in the name would end it early, so it is left out. */
export function mentionToken(person: TrackerPerson): string {
  const name = person.name.replaceAll(UNSAFE_IN_NAME, '').trim() || person.id;
  return `[@${name}](${MENTION_SCHEME}${person.id})`;
}

/** The text with each token as the bold name it stands for, as the tracker will show it. */
export function mentionsAsText(text: string): string {
  return text.replaceAll(MENTION_TOKEN, (_token, name: string) => `**@${name}**`);
}

const MARKS = /\p{Diacritic}/gu;

function folded(text: string): string {
  return text.normalize('NFD').replaceAll(MARKS, '').toLowerCase();
}

/** The people whose name has a word starting with `query` (case and accents ignored), at most `limit`. */
export function matchingPeople(
  people: readonly TrackerPerson[],
  query: string,
  limit: number,
): TrackerPerson[] {
  const wanted = folded(query.trim());
  return people
    .filter((person) => {
      const name = folded(person.name);
      return wanted === '' || name.startsWith(wanted) || name.includes(` ${wanted}`);
    })
    .slice(0, limit);
}

// What a pull request rule can pick from the repository: its labels and the users who can be assigned or asked to review.
import type { Octokit } from 'octokit';

import type { RuleChoices } from './event-api-types';

const PER_PAGE = 100;
/** The pickers list at most 500 of each; one past them can still be typed. */
const MAX_PAGES = 5;

function byName(a: string, b: string): number {
  return a.localeCompare(b);
}

/** Every page of a list, in order, up to `MAX_PAGES`. */
async function pagesOf<T>(read: (page: number) => Promise<T[]>): Promise<T[]> {
  const items: T[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    // oxlint-disable-next-line no-await-in-loop -- pages are read in order, and stop at the last one
    const data = await read(page);
    items.push(...data);
    if (data.length < PER_PAGE) {
      break;
    }
  }
  return items;
}

/** The repository's label names and assignable logins, each by name. */
export async function fetchRuleChoices(
  octokit: Octokit,
  repo: { owner: string; repo: string },
): Promise<RuleChoices> {
  const [labels, users] = await Promise.all([
    pagesOf(async (page) => {
      const { data } = await octokit.rest.issues.listLabelsForRepo({
        ...repo,
        per_page: PER_PAGE,
        page,
      });
      return data.map((label) => label.name);
    }),
    pagesOf(async (page) => {
      const { data } = await octokit.rest.issues.listAssignees({
        ...repo,
        per_page: PER_PAGE,
        page,
      });
      return data.map((user) => user.login);
    }),
  ]);
  return { labels: labels.toSorted(byName), users: users.toSorted(byName) };
}

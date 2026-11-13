// The people a Notion comment can tag: the workspace's members whose name matches what was typed.

import type { NotionApi } from './notion-api';
import { NotionError } from './notion-error';
import { matchingPeople, type TrackerPerson } from './tracker-mention';
import { TrackerRefusedError } from './tracker-refused';

/** More would not fit the list under the comment box. */
const MAX_PEOPLE = 10;
const FORBIDDEN = 403;
const NO_USERS =
  'The Notion integration cannot list people: in Notion, open the integration’s settings, then ' +
  'Capabilities, and choose a “Read user information” option.';

/** Notion has no search of its users: all of them are read (a few pages at most), then matched here. */
export async function notionPeople(
  notion: NotionApi,
  token: string,
  query: string,
): Promise<TrackerPerson[]> {
  try {
    return matchingPeople(await notion.users(token), query, MAX_PEOPLE);
  } catch (error) {
    if (error instanceof NotionError && error.status === FORBIDDEN) {
      throw new TrackerRefusedError(NO_USERS);
    }
    throw error;
  }
}

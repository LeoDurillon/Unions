// What a Jira field rule picks from (the project's assignable people, versions, components, sprints), read from Jira
// when the editor asks, and "the active sprint" or "the next sprint" resolved when a rule runs.
import type { JiraApi, JiraAuth } from './jira-api';
import { JiraError } from './jira-error';
import { ACTIVE_SPRINT, NEXT_SPRINT, type JiraPick, type JiraPickedType } from './jira-field-types';
import { isRecord, text } from './jira-parse';

/** A sprint of the project's board, in the board's order. */
type JiraSprint = JiraPick & { state: string };

/** Jira's largest page of assignable users. */
const MAX_USERS = 1000;
const CONFLICT = 409;

/** A list, or a page of one (`{ values }`, as Jira Software and some REST calls answer). */
function items(body: unknown): Record<string, unknown>[] {
  const list = isRecord(body) ? body.values : body;
  return Array.isArray(list) ? list.filter((item) => isRecord(item)) : [];
}

/** People: those who can be assigned in the project (apps and bots left out). */
function usersOf(body: unknown): JiraPick[] {
  return items(body)
    .filter((user) => text(user, 'accountType') !== 'app')
    .map((user) => ({ id: text(user, 'accountId'), name: text(user, 'displayName') }))
    .filter((user) => user.id !== '');
}

/** Versions and components: archived versions are left out. */
function namedOf(body: unknown): JiraPick[] {
  return items(body)
    .filter((item) => item.archived !== true)
    .map((item) => ({ id: text(item, 'id'), name: text(item, 'name') }))
    .filter((item) => item.id !== '');
}

function project(key: string): string {
  return encodeURIComponent(key);
}

/** The active and future sprints of the project's first scrum board. */
async function sprintsOf(jira: JiraApi, auth: JiraAuth, projectKey: string): Promise<JiraSprint[]> {
  const boards = items(
    await jira.read(auth, `/rest/agile/1.0/board?projectKeyOrId=${project(projectKey)}&type=scrum`),
  );
  const [board] = boards;
  if (!board) {
    throw new JiraError(
      `The Jira project ${projectKey} has no scrum board: sprints need one`,
      CONFLICT,
    );
  }
  const path = `/rest/agile/1.0/board/${text(board, 'id')}/sprint?state=active,future`;
  return items(await jira.read(auth, path)).map((sprint) => ({
    id: text(sprint, 'id'),
    name: text(sprint, 'name'),
    state: text(sprint, 'state'),
  }));
}

type Reader = (jira: JiraApi, auth: JiraAuth, projectKey: string) => Promise<JiraPick[]>;

const READERS: Record<JiraPickedType, Reader> = {
  user: async (jira, auth, key) =>
    usersOf(
      await jira.read(
        auth,
        `/user/assignable/search?project=${project(key)}&maxResults=${MAX_USERS}`,
      ),
    ),
  versions: async (jira, auth, key) =>
    namedOf(await jira.read(auth, `/project/${project(key)}/versions`)),
  components: async (jira, auth, key) =>
    namedOf(await jira.read(auth, `/project/${project(key)}/components`)),
  sprint: async (jira, auth, key) => {
    const sprints = await sprintsOf(jira, auth, key);
    return [
      { id: ACTIVE_SPRINT, name: 'The active sprint' },
      { id: NEXT_SPRINT, name: 'The next sprint' },
      ...sprints.map(({ id, name }) => ({ id, name })),
    ];
  },
};

/** What a field of this type can be set to, for the rule editor; sprints start with the active and next ones. */
export function jiraPicks(
  jira: JiraApi,
  auth: JiraAuth,
  projectKey: string,
  type: JiraPickedType,
): Promise<JiraPick[]> {
  return READERS[type](jira, auth, projectKey);
}

/**
 * A sprint pick as Jira takes it: "the active sprint" and "the next sprint" are the board's when the
 * rule runs (a sprint picked by name is kept as it is); `name` says which it was.
 */
export async function resolveSprint(
  jira: JiraApi,
  auth: JiraAuth,
  projectKey: string,
  pick: JiraPick,
): Promise<JiraPick> {
  if (pick.id !== ACTIVE_SPRINT && pick.id !== NEXT_SPRINT) {
    return pick;
  }
  const state = pick.id === ACTIVE_SPRINT ? 'active' : 'future';
  const sprints = await sprintsOf(jira, auth, projectKey);
  const sprint = sprints.find((each) => each.state === state);
  if (!sprint) {
    throw new JiraError(
      `The board has no ${state === 'active' ? 'active' : 'next'} sprint`,
      CONFLICT,
    );
  }
  return { id: sprint.id, name: `${pick.name} (${sprint.name})` };
}

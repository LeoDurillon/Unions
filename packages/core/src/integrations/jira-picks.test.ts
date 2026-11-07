import { expect, test } from 'bun:test';

import type { JiraApi, JiraAuth } from './jira-api';
import { jiraPicks, resolveSprint } from './jira-picks';

const auth: JiraAuth = { site: 'https://acme.atlassian.net', email: 'a@b.c', token: 't' };

/** Answers the reads by path; anything else is not found. */
function fake(answers: Record<string, unknown>, paths: string[] = []): JiraApi {
  return {
    read: (_auth: JiraAuth, path: string) => {
      paths.push(path);
      return path in answers ? Promise.resolve(answers[path]) : Promise.reject(new Error(path));
    },
  } satisfies Partial<JiraApi> as unknown as JiraApi;
}

/** The message a read fails with ('' if it does not). */
async function failure(read: Promise<unknown>): Promise<string> {
  try {
    await read;
    return '';
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

const BOARD = '/rest/agile/1.0/board?projectKeyOrId=ABC';
const SPRINTS = '/rest/agile/1.0/board/7/sprint?state=active,future';
const BOARD_SPRINTS = {
  // A kanban board has no sprints; a team-managed project's board is "simple".
  [BOARD]: {
    values: [
      { id: 3, name: 'ABC kanban', type: 'kanban' },
      { id: 7, name: 'ABC board', type: 'simple' },
    ],
  },
  [SPRINTS]: {
    values: [
      { id: 41, name: 'Sprint 12', state: 'active' },
      { id: 42, name: 'Sprint 13', state: 'future' },
    ],
  },
};

test('people, versions and components are read from the project; apps and archived versions left out', async () => {
  const jira = fake({
    '/user/assignable/search?project=ABC&maxResults=1000': [
      { accountId: 'u1', displayName: 'Ada', accountType: 'atlassian' },
      { accountId: 'bot', displayName: 'Automation', accountType: 'app' },
    ],
    '/project/ABC/versions': [
      { id: '10', name: '2.4' },
      { id: '9', name: '2.3', archived: true },
    ],
    '/project/ABC/components': [{ id: '5', name: 'API' }],
  });
  expect(await jiraPicks(jira, auth, 'ABC', 'user')).toEqual([{ id: 'u1', name: 'Ada' }]);
  expect(await jiraPicks(jira, auth, 'ABC', 'versions')).toEqual([{ id: '10', name: '2.4' }]);
  expect(await jiraPicks(jira, auth, 'ABC', 'components')).toEqual([{ id: '5', name: 'API' }]);
});

test("sprints start with the active and the next one, then the board's", async () => {
  expect(await jiraPicks(fake(BOARD_SPRINTS), auth, 'ABC', 'sprint')).toEqual([
    { id: 'active', name: 'The active sprint' },
    { id: 'next', name: 'The next sprint' },
    { id: '41', name: 'Sprint 12' },
    { id: '42', name: 'Sprint 13' },
  ]);
  const noBoard = fake({ [BOARD]: { values: [{ id: 3, type: 'kanban' }] } });
  expect(await failure(jiraPicks(noBoard, auth, 'ABC', 'sprint'))).toBe(
    'The Jira project ABC has no board with sprints (a scrum board, or sprints turned on)',
  );
});

test('the active and next sprints are resolved when the rule runs; a picked one is kept', async () => {
  const jira = fake(BOARD_SPRINTS);
  expect(
    await resolveSprint(jira, auth, 'ABC', { id: 'active', name: 'The active sprint' }),
  ).toEqual({ id: '41', name: 'The active sprint (Sprint 12)' });
  expect(await resolveSprint(jira, auth, 'ABC', { id: 'next', name: 'The next sprint' })).toEqual({
    id: '42',
    name: 'The next sprint (Sprint 13)',
  });
  const paths: string[] = [];
  expect(
    await resolveSprint(fake({}, paths), auth, 'ABC', { id: '40', name: 'Sprint 11' }),
  ).toEqual({
    id: '40',
    name: 'Sprint 11',
  });
  expect(paths).toEqual([]);
  const ended = fake({ [BOARD]: BOARD_SPRINTS[BOARD], [SPRINTS]: { values: [] } });
  const active = { id: 'active', name: 'The active sprint' };
  expect(await failure(resolveSprint(ended, auth, 'ABC', active))).toBe(
    'The board has no active sprint',
  );
});

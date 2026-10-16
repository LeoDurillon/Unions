// Tests the GitHub Project fields action through the dispatcher: the issue's item or the PR's, all or nothing, skips.
import { beforeEach, expect, test } from 'bun:test';

import {
  createDb,
  createTicket,
  emitEvent,
  migrateDb,
  queueDeliveries,
  recentDeliveries,
  saveRule,
  schema,
  type Db,
  type NotionApi,
  type ProjectFieldValue,
  type ProjectItemTarget,
} from '@union/core';
import { eq } from 'drizzle-orm';

import { EventDispatcher } from '../event-dispatcher';
import { FakeGitHubApi } from '../github/fake-api';

let db: Db;
let projectId: number;
let api: FakeGitHubApi;

const notion = {} as NotionApi;

const SPRINT: ProjectFieldValue = {
  fieldId: 'F_sprint',
  fieldName: 'Sprint',
  fieldType: 'number',
  value: '{pr.number}',
};
const AREA: ProjectFieldValue = {
  fieldId: 'F_area',
  fieldName: 'Area',
  fieldType: 'single_select',
  value: 'UI',
};

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  projectId = db
    .insert(schema.projects)
    .values({
      owner: 'acme',
      repo: 'shop',
      githubProjectNodeId: 'P_1',
      config: { baseBranch: 'main' },
    })
    .returning()
    .get().id;
  queueDeliveries(db);
  api = new FakeGitHubApi();
});

function fieldsRule(item: ProjectItemTarget, values: ProjectFieldValue[]): void {
  saveRule(db, projectId, {
    name: 'Sprint',
    enabled: true,
    trigger: { kind: 'pull_request_linked' },
    action: { kind: 'github_project_fields', item, values },
  });
}

function openPullRequest(change: {
  prNumber?: number | null;
  projectItemId?: string | null;
}): void {
  const ticket = createTicket(db, { projectId, title: 'Search' });
  db.update(schema.tickets)
    .set({ prNumber: 7, projectItemId: 'item_issue', ...change })
    .where(eq(schema.tickets.id, ticket.id))
    .run();
  emitEvent(db, {
    type: 'pull_request_opened',
    ticketId: ticket.id,
    payload: { number: 7, url: '' },
  });
}

async function dispatch(): Promise<void> {
  const dispatcher = new EventDispatcher(db, notion, () => api);
  dispatcher.tick();
  await dispatcher.idle();
}

test("the fields are set on the pull request's item, added to the Project", async () => {
  fieldsRule('pull_request', [SPRINT, AREA]);
  openPullRequest({});
  await dispatch();
  expect(api.itemFields.get('item_PR_7')).toEqual({
    F_sprint: { number: 7 },
    F_area: { singleSelectOptionId: 'o_UI' },
  });
  expect(recentDeliveries(db, projectId)).toMatchObject([
    {
      status: 'succeeded',
      detail: `On the pull request's item: Sprint set to "7", Area set to "UI"`,
    },
  ]);
});

test("the fields are set on the issue's item; an empty value clears its field", async () => {
  fieldsRule('issue', [{ ...AREA, value: '' }]);
  openPullRequest({});
  await dispatch();
  expect(api.itemFields.get('item_issue')).toEqual({ F_area: null });
  expect(api.calls).not.toContain('addToProject');
});

test('a field or option gone from the Project fails it all, naming it, before anything is set', async () => {
  fieldsRule('pull_request', [SPRINT, { ...AREA, value: 'Mobile' }]);
  openPullRequest({});
  await dispatch();
  expect(api.calls).not.toContain('setProjectField');
  expect(api.calls).not.toContain('addToProject');
  expect(recentDeliveries(db, projectId)[0]).toMatchObject({
    status: 'failed',
    error: 'Area: "Mobile" is not an option of Area (UI, API)',
  });

  api.fields = api.fields.filter((field) => field.id !== 'F_sprint');
  openPullRequest({});
  await dispatch();
  expect(recentDeliveries(db, projectId)[0]).toMatchObject({
    status: 'failed',
    error: 'Sprint is no longer a field of the GitHub Project',
  });
});

test('without a pull request, or an issue on the Project, the rule is skipped', async () => {
  fieldsRule('pull_request', [SPRINT]);
  openPullRequest({ prNumber: null });
  await dispatch();
  expect(recentDeliveries(db, projectId)[0]?.detail).toBe('The ticket has no pull request');
  // Deleting a rule deletes its deliveries: the check above comes first.
  db.delete(schema.eventRules).run();
  fieldsRule('issue', [AREA]);
  openPullRequest({ projectItemId: null });
  await dispatch();
  expect(recentDeliveries(db, projectId)[0]?.detail).toBe(
    "The ticket's issue is not on the GitHub Project",
  );
});

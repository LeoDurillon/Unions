import { beforeEach, expect, test } from 'bun:test';

import { createDb, migrateDb, type Db } from './db';
import { checkedJiraComment, checkedJiraFields, checkedJiraTransition } from './event-jira-action';
import { EventRuleError } from './event-notion-action';
import { saveIntegration, storeFields } from './integrations/store';
import * as schema from './tables';

let db: Db;
let projectId: number;

const FIELDS = {
  projectName: 'Apollo',
  issueTypes: [{ id: '10001', name: 'Story' }],
  statuses: [
    { id: '1', name: 'To Do', category: 'new' },
    { id: '3', name: 'In Review', category: 'indeterminate' },
  ],
  fields: [
    { id: 'customfield_10050', name: 'PR link', type: 'text' },
    { id: 'customfield_10051', name: 'Points', type: 'number' },
    { id: 'customfield_10052', name: 'Priority level', type: 'option' },
    { id: 'assignee', name: 'Assignee', type: 'user' },
    { id: 'fixVersions', name: 'Fix versions', type: 'versions' },
  ],
};

function connect(fields: unknown): void {
  const config = { site: 'https://acme.atlassian.net', email: 'a@b.c', projectKey: 'ABC' };
  const saved = saveIntegration(db, projectId, 'jira', { secret: 'tok', config });
  storeFields(db, saved.id, { title: 'Apollo', fields });
}

/** The message a check refuses with. */
function refusal(check: () => unknown): string {
  try {
    check();
  } catch (error) {
    expect(error).toBeInstanceOf(EventRuleError);
    return error instanceof Error ? error.message : '';
  }
  throw new Error('Expected a refusal');
}

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  projectId = db
    .insert(schema.projects)
    .values({ owner: 'acme', repo: 'shop', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
});

test('Jira actions need the project connected to Jira', () => {
  const message = 'Connect the project to Jira first (Settings → Integrations → Jira)';
  expect(refusal(() => checkedJiraTransition(db, projectId, { statusId: '3' }))).toBe(message);
  expect(refusal(() => checkedJiraComment(db, projectId, { body: 'Hi' }))).toBe(message);
});

test('a move targets a status of the Jira project, its name as stored', () => {
  connect(FIELDS);
  expect(checkedJiraTransition(db, projectId, { statusId: '3', statusName: 'Renamed' })).toEqual({
    kind: 'jira_transition',
    statusId: '3',
    statusName: 'In Review',
  });
  expect(refusal(() => checkedJiraTransition(db, projectId, { statusId: '99' }))).toBe(
    'Pick a status of the Jira project',
  );
});

test('fields are checked against the stored ones, keeping their name and type', () => {
  connect(FIELDS);
  expect(
    checkedJiraFields(db, projectId, {
      values: [
        { fieldId: 'customfield_10050', value: '{pr.url}' },
        { fieldId: 'customfield_10052', value: 'High' },
      ],
    }),
  ).toEqual({
    kind: 'jira_field',
    values: [
      { fieldId: 'customfield_10050', fieldName: 'PR link', fieldType: 'text', value: '{pr.url}' },
      {
        fieldId: 'customfield_10052',
        fieldName: 'Priority level',
        fieldType: 'option',
        value: 'High',
      },
    ],
  });
  const fields = (values: unknown[]): string =>
    refusal(() => checkedJiraFields(db, projectId, { values }));
  expect(fields([])).toBe('Pick a field of the Jira issue');
  expect(fields([{ fieldId: 'customfield_1', value: 'x' }])).toBe('Pick a field of the Jira issue');
  expect(fields([{ fieldId: 'customfield_10051', value: 'many' }])).toBe(
    'Points: "many" is not a number',
  );
  const twice = { fieldId: 'customfield_10050', value: 'x' };
  expect(fields([twice, twice])).toBe('PR link is set twice: keep one');
});

test('fields read before rules could set them ask for a Refresh', () => {
  connect({ ...FIELDS, fields: undefined });
  expect(
    refusal(() => checkedJiraFields(db, projectId, { values: [{ fieldId: 'x', value: 'y' }] })),
  ).toBe('Read the Jira fields first (Refresh from Jira)');
  // A move needs only the statuses, which were read already.
  expect(checkedJiraTransition(db, projectId, { statusId: '1' }).statusName).toBe('To Do');
});

test('a comment is written, within the limit, with known variables', () => {
  connect(FIELDS);
  expect(checkedJiraComment(db, projectId, { body: ' Ready for QA: {pr.url} ' })).toEqual({
    kind: 'jira_comment',
    body: 'Ready for QA: {pr.url}',
  });
  expect(refusal(() => checkedJiraComment(db, projectId, { body: ' ' }))).toBe('Write the comment');
  expect(refusal(() => checkedJiraComment(db, projectId, { body: '{pr.link}' }))).toBe(
    'Unknown variable: {pr.link}',
  );
  expect(refusal(() => checkedJiraComment(db, projectId, { body: 'x'.repeat(32_768) }))).toContain(
    'at most',
  );
});

test('a project connected without reading Jira (the setup wizard) is asked to read it first', () => {
  const config = { site: 'https://acme.atlassian.net', email: 'a@b.c', projectKey: 'ABC' };
  saveIntegration(db, projectId, 'jira', { secret: 'tok', config });
  const message = 'Read the Jira project first (Refresh from Jira, above the rules)';
  expect(refusal(() => checkedJiraTransition(db, projectId, { statusId: '3' }))).toBe(message);
  expect(refusal(() => checkedJiraComment(db, projectId, { body: 'Hi' }))).toBe(message);
});

test('fields stored before rules knew which can be set are narrowed when read back', () => {
  connect({
    ...FIELDS,
    fields: [...FIELDS.fields, { id: 'created', name: 'Created', type: 'datetime' }],
  });
  const refused = refusal(() =>
    checkedJiraFields(db, projectId, { values: [{ fieldId: 'created', value: '{date.now}' }] }),
  );
  expect(refused).toBe('Pick a field of the Jira issue');
});

test('picked fields keep their picks, their names as the value; a person is one', () => {
  connect(FIELDS);
  const ada = { id: 'u1', name: 'Ada' };
  expect(
    checkedJiraFields(db, projectId, {
      values: [
        { fieldId: 'assignee', value: 'ignored', picks: [ada] },
        {
          fieldId: 'fixVersions',
          picks: [{ id: '10', name: '2.4' }, { id: '11', name: '2.5' }, { id: '' }],
        },
      ],
    }).values,
  ).toEqual([
    { fieldId: 'assignee', fieldName: 'Assignee', fieldType: 'user', value: 'Ada', picks: [ada] },
    {
      fieldId: 'fixVersions',
      fieldName: 'Fix versions',
      fieldType: 'versions',
      value: '2.4, 2.5',
      picks: [
        { id: '10', name: '2.4' },
        { id: '11', name: '2.5' },
      ],
    },
  ]);
  expect(
    refusal(() =>
      checkedJiraFields(db, projectId, {
        values: [{ fieldId: 'assignee', picks: [ada, { id: 'u2', name: 'Bo' }] }],
      }),
    ),
  ).toBe('Assignee: pick one');
});

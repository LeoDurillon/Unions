import { beforeEach, expect, test } from 'bun:test';

import { createDb, migrateDb, type Db } from '../db';
import { saveIntegration, storeFields } from '../integrations/store';
import * as schema from '../tables';
import { checkedAction } from './event-action-checks';
import type { EventAction } from './event-actions';
import { EventRuleError } from './event-rule-error';

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

/** A Jira action of `kind` as the settings page sends it, checked. */
function checked(kind: string, record: object): EventAction {
  return checkedAction(db, projectId, { kind, tracker: 'jira', ...record });
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
  expect(refusal(() => checked('tracker_status', { statusId: '3' }))).toBe(message);
  expect(refusal(() => checked('tracker_comment', { body: 'Hi' }))).toBe(message);
});

test('Notion takes no move: a tracker takes only the actions its kind lists', () => {
  expect(
    refusal(() => checkedAction(db, projectId, { kind: 'tracker_status', tracker: 'notion' })),
  ).toBe('Pick what the rule does');
  expect(
    refusal(() => checkedAction(db, projectId, { kind: 'tracker_fields', tracker: 'x' })),
  ).toBe('Pick what the rule does');
});

test('the kinds before tracker actions are read as the tracker action each became', () => {
  connect(FIELDS);
  expect(checkedAction(db, projectId, { kind: 'jira_transition', statusId: '3' })).toEqual({
    kind: 'tracker_status',
    tracker: 'jira',
    statusId: '3',
    statusName: 'In Review',
  });
  expect(checkedAction(db, projectId, { kind: 'jira_comment', body: 'Hi' })).toEqual({
    kind: 'tracker_comment',
    tracker: 'jira',
    body: 'Hi',
  });
  expect(
    checkedAction(db, projectId, {
      kind: 'jira_field',
      values: [{ fieldId: 'customfield_10051', value: '3' }],
    }),
  ).toMatchObject({ kind: 'tracker_fields', tracker: 'jira' });
});

test('a move targets a status of the Jira project, its name as stored', () => {
  connect(FIELDS);
  expect(checked('tracker_status', { statusId: '3', statusName: 'Renamed' })).toEqual({
    kind: 'tracker_status',
    tracker: 'jira',
    statusId: '3',
    statusName: 'In Review',
  });
  expect(refusal(() => checked('tracker_status', { statusId: '99' }))).toBe(
    'Pick a status of the Jira project',
  );
});

test('fields are checked against the stored ones, keeping their name and type', () => {
  connect(FIELDS);
  expect(
    checked('tracker_fields', {
      values: [
        { fieldId: 'customfield_10050', value: '{pr.url}' },
        { fieldId: 'customfield_10052', value: 'High' },
      ],
    }),
  ).toEqual({
    kind: 'tracker_fields',
    tracker: 'jira',
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
    refusal(() => checked('tracker_fields', { values }));
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
  expect(refusal(() => checked('tracker_fields', { values: [{ fieldId: 'x', value: 'y' }] }))).toBe(
    'Read the Jira fields first (Refresh from Jira)',
  );
  // A move needs only the statuses, which were read already.
  expect(checked('tracker_status', { statusId: '1' })).toMatchObject({ statusName: 'To Do' });
});

test('a comment is written, within the limit, with known variables', () => {
  connect(FIELDS);
  expect(checked('tracker_comment', { body: ' Ready for QA: {pr.url} ' })).toEqual({
    kind: 'tracker_comment',
    tracker: 'jira',
    body: 'Ready for QA: {pr.url}',
  });
  expect(refusal(() => checked('tracker_comment', { body: ' ' }))).toBe('Write the comment');
  expect(refusal(() => checked('tracker_comment', { body: '{pr.link}' }))).toBe(
    'Unknown variable: {pr.link}',
  );
  expect(refusal(() => checked('tracker_comment', { body: 'x'.repeat(32_768) }))).toContain(
    'at most',
  );
});

test('a project connected without reading Jira (the setup wizard) is asked to read it first', () => {
  const config = { site: 'https://acme.atlassian.net', email: 'a@b.c', projectKey: 'ABC' };
  saveIntegration(db, projectId, 'jira', { secret: 'tok', config });
  const message = 'Read the Jira project first (Refresh from Jira, above the rules)';
  expect(refusal(() => checked('tracker_status', { statusId: '3' }))).toBe(message);
  expect(refusal(() => checked('tracker_comment', { body: 'Hi' }))).toBe(message);
});

test('fields stored before rules knew which can be set are narrowed when read back', () => {
  connect({
    ...FIELDS,
    fields: [...FIELDS.fields, { id: 'created', name: 'Created', type: 'datetime' }],
  });
  const refused = refusal(() =>
    checked('tracker_fields', { values: [{ fieldId: 'created', value: '{date.now}' }] }),
  );
  expect(refused).toBe('Pick a field of the Jira issue');
});

test('picked fields keep their picks, their names as the value; a person is one', () => {
  connect(FIELDS);
  const ada = { id: 'u1', name: 'Ada' };
  expect(
    checked('tracker_fields', {
      values: [
        { fieldId: 'assignee', value: 'ignored', picks: [ada] },
        {
          fieldId: 'fixVersions',
          picks: [{ id: '10', name: '2.4' }, { id: '11', name: '2.5' }, { id: '' }],
        },
      ],
    }),
  ).toMatchObject({
    values: [
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
    ],
  });
  expect(
    refusal(() =>
      checked('tracker_fields', {
        values: [{ fieldId: 'assignee', picks: [ada, { id: 'u2', name: 'Bo' }] }],
      }),
    ),
  ).toBe('Assignee: pick one');
});

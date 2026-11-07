import { expect, test } from 'bun:test';

import { fieldTypeOf } from './jira-field-types';
import { fieldsOf } from './jira-parse';

const schema = (
  type: string,
  extra: { items?: string; custom?: string } = {},
): {
  type: string;
  items: string;
  custom: string;
} => ({ type, items: extra.items ?? '', custom: extra.custom ?? '' });

test('the rule type of a field comes from its schema', () => {
  const textarea = 'com.atlassian.jira.plugin.system.customfieldtypes:textarea';
  expect(fieldTypeOf('customfield_1', schema('string'))).toBe('text');
  expect(fieldTypeOf('customfield_2', schema('string', { custom: textarea }))).toBe('textarea');
  expect(fieldTypeOf('environment', schema('string'))).toBe('textarea');
  expect(fieldTypeOf('customfield_3', schema('number'))).toBe('number');
  expect(fieldTypeOf('duedate', schema('date'))).toBe('date');
  expect(fieldTypeOf('customfield_4', schema('datetime'))).toBe('datetime');
  expect(fieldTypeOf('customfield_5', schema('option'))).toBe('option');
  expect(fieldTypeOf('labels', schema('array', { items: 'string' }))).toBe('labels');
  const customLabels = 'com.atlassian.jira.plugin.system.customfieldtypes:labels';
  expect(
    fieldTypeOf('customfield_6', schema('array', { items: 'string', custom: customLabels })),
  ).toBe('labels');
});

test("Jira's own fields are left out but the due date, labels and environment", () => {
  for (const id of [
    'created',
    'updated',
    'lastViewed',
    'resolutiondate',
    'statuscategorychangedate',
    'workratio',
    'timespent',
    'timeestimate',
    'timeoriginalestimate',
    'aggregatetimespent',
  ]) {
    expect(fieldTypeOf(id, schema(id === 'workratio' ? 'number' : 'datetime'))).toBeNull();
  }
  expect(fieldTypeOf('duedate', schema('date'))).toBe('date');
  expect(fieldTypeOf('customfield_10015', schema('date'))).toBe('date');
});

test('fields rules leave out have no type', () => {
  expect(fieldTypeOf('summary', schema('string'))).toBeNull();
  expect(fieldTypeOf('description', schema('string'))).toBeNull();
  expect(fieldTypeOf('assignee', schema('user'))).toBeNull();
  expect(fieldTypeOf('fixVersions', schema('array', { items: 'version' }))).toBeNull();
  expect(fieldTypeOf('customfield_7', schema('array', { items: 'option' }))).toBeNull();
  expect(fieldTypeOf('customfield_8', schema('array', { items: 'string' }))).toBeNull();
});

test('GET /field is read into the settable fields, sorted by name', () => {
  expect(
    fieldsOf([
      { id: 'summary', name: 'Summary', schema: { type: 'string', system: 'summary' } },
      { id: 'customfield_10050', name: 'PR link', schema: { type: 'string', customId: 10_050 } },
      {
        id: 'labels',
        name: 'Labels',
        schema: { type: 'array', items: 'string', system: 'labels' },
      },
      { id: 'assignee', name: 'Assignee', schema: { type: 'user' } },
      { id: 'customfield_10060', name: 'Shipped on', schema: { type: 'date' } },
      { name: 'No id' },
      'not a field',
    ]),
  ).toEqual([
    { id: 'labels', name: 'Labels', type: 'labels' },
    { id: 'customfield_10050', name: 'PR link', type: 'text' },
    { id: 'customfield_10060', name: 'Shipped on', type: 'date' },
  ]);
});

// Tests that every field type a tracker lets Union set has a shared type, and those it does not have none.

import { expect, test } from 'bun:test';

import { WRITABLE_NOTION_TYPES } from '../event/event-rule-types';
import { isJiraFieldType } from './jira-field-types';
import { integrationKind } from './kinds';

const JIRA_TYPES = [
  'text',
  'textarea',
  'number',
  'date',
  'datetime',
  'option',
  'labels',
  'multi_option',
  'user',
  'versions',
  'components',
  'sprint',
];

test('every Notion type a rule can set has a shared type; a formula has none', () => {
  const notion = integrationKind('notion');
  const fieldShape = (type: string): unknown => notion.fieldShape(type);
  for (const type of WRITABLE_NOTION_TYPES) {
    expect(fieldShape(type)).not.toBeNull();
  }
  expect(fieldShape('formula')).toBeNull();
  expect(fieldShape('status')).toMatchObject({ type: 'select', newOptions: false });
  expect(fieldShape('select')).toMatchObject({ type: 'select', newOptions: true });
  expect(fieldShape('people')).toMatchObject({ type: 'people', variables: false });
});

test("every Jira field type has a shared type, and the status moves through the issue's transitions", () => {
  const jira = integrationKind('jira');
  const fieldShape = (type: string): unknown => jira.fieldShape(type);
  for (const type of JIRA_TYPES) {
    expect(isJiraFieldType(type)).toBe(true);
    expect(fieldShape(type)).not.toBeNull();
  }
  expect(fieldShape('status')).toMatchObject({ type: 'move' });
  expect(fieldShape('option')).toMatchObject({ type: 'select', variables: false });
  expect(fieldShape('sprint')).toMatchObject({ type: 'picked', single: true });
  expect(fieldShape('versions')).toMatchObject({ type: 'picked', single: false });
});

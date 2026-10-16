// Tests a rule's GitHub Project fields: their checks, Status left to Union on the issue, and the values sent.
import { expect, test } from 'bun:test';

import {
  checkProjectFields,
  projectFieldInput,
  projectFieldsText,
  type ProjectField,
} from './event-project-fields-action';

const SPRINT = {
  fieldId: 'F_sprint',
  fieldName: 'Sprint',
  fieldType: 'number',
  value: '12',
} as const;
const AREA = {
  fieldId: 'F_area',
  fieldName: 'Area',
  fieldType: 'single_select',
  value: 'UI',
} as const;

test('the fields are kept with the item they go on', () => {
  expect(checkProjectFields({ item: 'pull_request', values: [SPRINT, AREA] })).toEqual({
    item: 'pull_request',
    values: [SPRINT, AREA],
  });
});

test('fields are refused with what is wrong', () => {
  expect(checkProjectFields({ item: 'board', values: [SPRINT] })).toEqual({
    error: 'Pick the item: the issue or the pull request',
  });
  expect(checkProjectFields({ item: 'issue', values: [] })).toEqual({
    error: 'Pick a field of the GitHub Project',
  });
  expect(
    checkProjectFields({ item: 'issue', values: [{ ...SPRINT, fieldType: 'iteration' }] }),
  ).toEqual({
    error: 'Pick a field of the GitHub Project',
  });
  expect(checkProjectFields({ item: 'issue', values: [SPRINT, SPRINT] })).toEqual({
    error: 'Sprint is set twice: keep one',
  });
  expect(checkProjectFields({ item: 'issue', values: [{ ...SPRINT, value: 'soon' }] })).toEqual({
    error: 'Sprint: "soon" is not a number',
  });
  expect(checkProjectFields({ item: 'issue', values: [{ ...AREA, value: '{area}' }] })).toEqual({
    error: 'Area: Unknown variable: {area}',
  });
});

test('Status is left to Union on the issue, and settable on the pull request', () => {
  const status = {
    fieldId: 'F_status',
    fieldName: 'Status',
    fieldType: 'single_select',
    value: 'QA',
  };
  expect(checkProjectFields({ item: 'issue', values: [status] })).toMatchObject({
    error: expect.stringContaining('set by Union') as unknown,
  });
  expect(checkProjectFields({ item: 'pull_request', values: [status] })).toMatchObject({
    item: 'pull_request',
  });
});

function field(type: ProjectField['type']): ProjectField {
  return { id: 'F', name: 'Area', type, options: ['UI', 'API'] };
}

test('a value takes the shape of its field, and empty clears it', () => {
  expect(projectFieldInput(field('number'), '3.5')).toEqual({ input: { number: 3.5 } });
  expect(projectFieldInput(field('date'), '2026-10-16')).toEqual({ input: { date: '2026-10-16' } });
  expect(projectFieldInput(field('date'), '16/10')).toEqual({
    error: '"16/10" is not a date (YYYY-MM-DD)',
  });
  expect(projectFieldInput(field('text'), '#12')).toEqual({ input: { text: '#12' } });
  expect(projectFieldInput(field('single_select'), 'UI', { UI: 'o_ui' })).toEqual({
    input: { singleSelectOptionId: 'o_ui' },
  });
  expect(projectFieldInput(field('single_select'), 'Web', { UI: 'o_ui' })).toEqual({
    error: '"Web" is not an option of Area (UI, API)',
  });
  expect(projectFieldInput(field('number'), '')).toEqual({ input: null });
  expect(
    projectFieldsText([
      { name: 'Sprint', text: '12' },
      { name: 'Area', text: '' },
    ]),
  ).toBe('Sprint set to "12", Area set to (empty)');
});

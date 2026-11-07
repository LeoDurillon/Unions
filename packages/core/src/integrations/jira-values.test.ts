import { expect, test } from 'bun:test';

import { jiraFieldValue, jiraValueError } from './jira-values';

test('each type gives what Jira takes; an empty value clears the field', () => {
  expect(jiraFieldValue('text', ' https://x.y/pr/1 ')).toEqual({ set: 'https://x.y/pr/1' });
  expect(jiraFieldValue('number', '12')).toEqual({ set: 12 });
  expect(jiraFieldValue('date', '2026-11-07')).toEqual({ set: '2026-11-07' });
  expect(jiraFieldValue('datetime', '2026-11-07T10:00:00.000Z')).toEqual({
    set: '2026-11-07T10:00:00.000+0000',
  });
  expect(jiraFieldValue('option', 'High')).toEqual({ set: { value: 'High' } });
  expect(jiraFieldValue('labels', 'qa, deployed ,')).toEqual({ add: ['qa', 'deployed'] });
  expect(jiraFieldValue('textarea', 'a\nb')).toMatchObject({
    set: { type: 'doc', content: [{ type: 'paragraph' }] },
  });
  for (const type of ['text', 'number', 'date', 'datetime', 'option', 'textarea'] as const) {
    expect(jiraFieldValue(type, ' ')).toEqual({ set: null });
  }
});

test('values that cannot be one say why', () => {
  expect(jiraFieldValue('number', 'twelve')).toEqual({ error: '"twelve" is not a number' });
  expect(jiraFieldValue('date', '07/11/2026')).toEqual({
    error: '"07/11/2026" is not a date (YYYY-MM-DD)',
  });
  expect(jiraFieldValue('datetime', 'soon')).toEqual({ error: '"soon" is not a date and time' });
  expect(jiraFieldValue('labels', 'in review')).toEqual({
    error: 'A Jira label has no spaces: "in review"',
  });
  expect(jiraFieldValue('labels', ' , ')).toEqual({ error: 'Give the labels to add' });
  expect(jiraFieldValue('text', 'x'.repeat(256))).toHaveProperty('error');
});

test('a saved value is checked now without variables, when filled in with them', () => {
  expect(jiraValueError('number', '{pr.number}')).toBeNull();
  expect(jiraValueError('number', 'twelve')).toBe('"twelve" is not a number');
  expect(jiraValueError('text', '{pr.link}')).toBe('Unknown variable: {pr.link}');
  expect(jiraValueError('option', '{board.status}')).toBe(
    'An option is picked by its name, not with variables',
  );
  expect(jiraValueError('labels', 'deployed,{ticket.branch}')).toBeNull();
});

// Tests reading a Notion page's properties for its tab: each type's value as text, and which Union can set.
import { expect, test } from 'bun:test';

import { pagePropertiesOf } from './notion-page-values';

/** One property of `type` holding `value`, read alone. */
function read(type: string, value: unknown): { text: string; value: string; settable: boolean } {
  const [property] = pagePropertiesOf({ P: { id: 'p', type, [type]: value } });
  return {
    text: property?.text ?? '(none)',
    value: property?.value ?? '(none)',
    settable: property?.settable ?? false,
  };
}

test('the values Union can set read as text', () => {
  expect(read('rich_text', [{ plain_text: 'Hello ' }, { plain_text: 'world' }])).toEqual({
    text: 'Hello world',
    value: 'Hello world',
    settable: true,
  });
  expect(read('number', 3).text).toBe('3');
  expect(read('select', { name: 'High' }).text).toBe('High');
  expect(read('status', { name: 'Done' }).text).toBe('Done');
  expect(read('multi_select', [{ name: 'Web' }, { name: 'iOS' }]).text).toBe('Web, iOS');
  expect(read('people', [{ name: 'Ada' }, { name: 'Alan' }]).text).toBe('Ada, Alan');
  expect(read('date', { start: '2026-11-13', end: null }).text).toBe('2026-11-13');
  expect(read('date', { start: '2026-11-13', end: '2026-11-20' }).text).toBe(
    '2026-11-13 → 2026-11-20',
  );
  expect(read('date', { start: '2026-11-12T16:15:00.000+01:00', end: null }).text).toBe(
    '2026-11-12 16:15',
  );
  expect(read('checkbox', true).text).toBe('Yes');
  expect(read('checkbox', false).text).toBe('No');
  expect(read('url', 'https://a.b').text).toBe('https://a.b');
});

test('an edit starts from what a rule would write: ids, true or false, the date as Notion gives it', () => {
  expect(
    read('people', [
      { id: 'u1', name: 'Ada' },
      { id: 'u2', name: 'Alan' },
    ]).value,
  ).toBe('u1, u2');
  expect(read('checkbox', true).value).toBe('true');
  expect(read('checkbox', false).value).toBe('false');
  expect(read('date', { start: '2026-11-12T16:15:00.000+01:00', end: null }).value).toBe(
    '2026-11-12T16:15:00.000+01:00',
  );
  expect(read('multi_select', [{ name: 'Web' }, { name: 'iOS' }]).value).toBe('Web, iOS');
});

test('empty values read as empty', () => {
  expect(read('select', null).text).toBe('');
  expect(read('multi_select', []).text).toBe('');
  expect(read('date', null).text).toBe('');
  expect(read('number', null).text).toBe('');
  expect(read('email', null).text).toBe('');
});

test('computed and system values are shown but cannot be set', () => {
  expect(read('formula', { type: 'number', number: 42 })).toEqual({
    text: '42',
    value: '42',
    settable: false,
  });
  expect(read('formula', { type: 'boolean', boolean: false }).text).toBe('No');
  expect(read('rollup', { type: 'array', array: [{}, {}] }).text).toBe('2 items');
  expect(read('relation', [{ id: 'a' }]).text).toBe('1 page');
  expect(read('unique_id', { prefix: 'TASK', number: 12 }).text).toBe('TASK-12');
  expect(read('created_by', { name: 'Ada' })).toEqual({
    text: 'Ada',
    value: 'Ada',
    settable: false,
  });
  expect(read('files', [{ name: 'spec.pdf' }]).text).toBe('spec.pdf');
});

test('the title and buttons are left out, an unknown type reads as empty', () => {
  expect(
    pagePropertiesOf({
      Name: { id: 'title', type: 'title', title: [] },
      Go: { id: 'b', type: 'button', button: {} },
      Odd: { id: 'o', type: 'something_new', something_new: 1 },
    }),
  ).toEqual([
    {
      id: 'o',
      name: 'Odd',
      type: 'something_new',
      text: '',
      value: '',
      options: [],
      settable: false,
    },
  ]);
});

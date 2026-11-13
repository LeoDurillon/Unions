// Tests reading a `set_tracker_fields` command's payload: what it needs, and what it fills in.
import { expect, test } from 'bun:test';

import { trackerFieldSetOf } from './tracker-field-set';

const FIELD = { id: 'p%3A', name: 'Priority', type: 'select', options: ['P1', 'P2'] };

test('a change from a ticket tab reads back with its text, trimmed value and no picks', () => {
  expect(
    trackerFieldSetOf({
      projectId: 1,
      kind: 'notion',
      itemId: 'page-1',
      ticketId: 7,
      field: FIELD,
      value: ' P1 ',
    }),
  ).toEqual({
    projectId: 1,
    kind: 'notion',
    itemId: 'page-1',
    ticketId: 7,
    reviewId: null,
    field: FIELD,
    value: 'P1',
    text: 'P1',
    picks: [],
  });
});

test('a change from a review keeps its picks and the text the user read', () => {
  const read = trackerFieldSetOf({
    projectId: 1,
    kind: 'jira',
    itemId: 'ABC-1',
    reviewId: 3,
    field: { id: 'fixVersions', type: 'versions' },
    value: '',
    text: '2.4',
    picks: [{ id: '10', name: '2.4' }, { name: 'no id' }],
  });
  expect(read.reviewId).toBe(3);
  expect(read.ticketId).toBeNull();
  expect(read.field).toEqual({
    id: 'fixVersions',
    name: 'fixVersions',
    type: 'versions',
    options: [],
  });
  expect(read.picks).toEqual([{ id: '10', name: '2.4' }]);
  expect(read.text).toBe('2.4');
});

test('a payload without a place, a kind Union knows or a field is refused', () => {
  const base = { projectId: 1, kind: 'notion', itemId: 'p', ticketId: 1, field: FIELD };
  expect(() => trackerFieldSetOf({ ...base, ticketId: undefined })).toThrow(TypeError);
  expect(() => trackerFieldSetOf({ ...base, kind: 'linear' })).toThrow(TypeError);
  expect(() => trackerFieldSetOf({ ...base, field: { id: 'x' } })).toThrow(TypeError);
  expect(() => trackerFieldSetOf(null)).toThrow(TypeError);
});

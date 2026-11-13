import { expect, test } from 'bun:test';

import { pageOf } from './notion-page-parse';

test('a page gives its title, when it changed and its status column', () => {
  expect(
    pageOf({
      id: 'p1',
      url: 'https://www.notion.so/p1',
      last_edited_time: '2026-11-12T10:00:00.000Z',
      parent: { type: 'data_source_id', data_source_id: 'ds1' },
      properties: {
        Name: { type: 'title', title: [{ plain_text: 'Export CSV' }] },
        Avancement: { type: 'status', status: { name: 'En cours' } },
      },
    }),
  ).toEqual({
    id: 'p1',
    title: 'Export CSV',
    url: 'https://www.notion.so/p1',
    dataSourceId: 'ds1',
    editedAt: '2026-11-12T10:00:00.000Z',
    status: { name: 'Avancement', value: 'En cours' },
    properties: [
      { id: 'Avancement', name: 'Avancement', type: 'status', text: 'En cours', settable: true },
    ],
  });
});

test('a page without a status column or an edit time has neither', () => {
  expect(
    pageOf({ id: 'p2', properties: { Etat: { type: 'select', select: { name: 'A' } } } }),
  ).toEqual({
    id: 'p2',
    title: '',
    url: '',
    dataSourceId: null,
    properties: [{ id: 'Etat', name: 'Etat', type: 'select', text: 'A', settable: true }],
  });
});

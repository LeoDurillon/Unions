// Tests of which cached queries an event makes stale.
import { expect, test } from 'bun:test';

import type { EventRow } from '../../src/api-types';
import { invalidationKeys } from './live-invalidation-keys';

function event(type: string, ids: Partial<EventRow> = {}): EventRow {
  return {
    seq: 1,
    ticketId: null,
    runId: null,
    investigationId: null,
    type,
    payload: {},
    at: 0,
    ...ids,
  };
}

test("a preview build's output refetches nothing: the log reads it from the stream", () => {
  expect(invalidationKeys(event('preview_output', { ticketId: 4 }))).toEqual([]);
});

test("a ticket's event refetches the board, the ticket and its review", () => {
  expect(invalidationKeys(event('run_finished', { ticketId: 4 }))).toEqual([
    ['tickets'],
    ['ticket', 4],
    ['review', '/api/tickets/4'],
  ]);
  expect(invalidationKeys(event('project_synced'))).toEqual([['tickets']]);
});

test('notifications, custom agents and investigations refetch only their own', () => {
  expect(invalidationKeys(event('notification_created', { ticketId: 4 }))).toEqual([
    ['notifications'],
  ]);
  expect(invalidationKeys(event('custom_agent_prompt_ready'))).toEqual([['agents']]);
  expect(invalidationKeys(event('investigation_finished', { investigationId: 2 }))).toEqual([
    ['investigations'],
  ]);
});

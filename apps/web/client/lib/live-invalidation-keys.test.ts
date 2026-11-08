// Tests of which cached queries an event makes stale.
import { expect, test } from 'bun:test';

import { QueryClient } from '@tanstack/react-query';

import type { EventRow } from '../../src/api-types';
import { invalidationKeys, reviewRunFilter } from './live-invalidation-keys';

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
    ['projects'],
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

test("a review side run's event refreshes that part of every open review, a pull request's included", async () => {
  const client = new QueryClient();
  const pullRequest = '/api/projects/1/pull-requests/reviews/7';
  for (const key of [
    ['review', pullRequest, 'grouping'],
    ['review', pullRequest, 'comments'],
    ['review', '/api/tickets/4', 'grouping'],
    ['tickets'],
  ]) {
    client.setQueryData(key, { cached: true });
  }
  const changed = event('review_grouping_changed', { ticketId: null });
  expect(invalidationKeys(changed)).toEqual([]);
  const filter = reviewRunFilter(changed);
  expect(filter).not.toBeNull();
  await client.invalidateQueries(filter ?? {});
  const stale = client
    .getQueryCache()
    .getAll()
    .filter((query) => query.isStale())
    .map((query) => query.queryKey);
  expect(stale).toEqual([
    ['review', pullRequest, 'grouping'],
    ['review', '/api/tickets/4', 'grouping'],
  ]);
  expect(reviewRunFilter(event('run_finished', { ticketId: 4 }))).toBeNull();
});

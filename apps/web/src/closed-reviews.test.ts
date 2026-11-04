// Which pull requests under review a listing shows closed or merged.
import { describe, expect, test } from 'bun:test';

import { closedReviewNumbers } from './routes/closed-reviews';

const pull = (
  number: number,
  state: 'open' | 'closed' | 'merged',
): { number: number; state: 'open' | 'closed' | 'merged' } => ({ number, state });

describe('closedReviewNumbers', () => {
  test('listed closed or merged', () => {
    const listing = {
      total: 3,
      pullRequests: [pull(1, 'open'), pull(2, 'merged'), pull(3, 'closed')],
    };
    expect(closedReviewNumbers([1, 2, 3, 4], listing, 'all')).toEqual([2, 3]);
  });

  test('missing from a complete Open listing', () => {
    const listing = { total: 1, pullRequests: [pull(1, 'open')] };
    expect(closedReviewNumbers([1, 2], listing, 'open')).toEqual([2]);
  });

  test('missing from an Open listing showing only the newest: kept', () => {
    const listing = { total: 150, pullRequests: [pull(1, 'open')] };
    expect(closedReviewNumbers([1, 2], listing, 'open')).toEqual([]);
  });
});

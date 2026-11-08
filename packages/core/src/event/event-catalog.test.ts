// Tests the event guard, and that an event's payload must be the one its type carries.
import { expect, test } from 'bun:test';

import { isEvent, type NewEvent, type StoredEvent } from './event-catalog';

test('isEvent narrows on the type alone', () => {
  const stored: StoredEvent = { type: 'run_started', payload: { step: 'intake' } };
  expect(isEvent(stored, 'run_started')).toBe(true);
  expect(isEvent(stored, 'run_finished')).toBe(false);
  if (isEvent(stored, 'run_started')) {
    expect(stored.payload.step).toBe('intake');
  }
});

test('a payload that is not the one its type carries does not compile', () => {
  // @ts-expect-error: run_started carries the step
  const wrong: NewEvent = { type: 'run_started', payload: { status: 'failed' } };
  expect(wrong.type).toBe('run_started');
});

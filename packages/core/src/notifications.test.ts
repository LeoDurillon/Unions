import { expect, test } from 'bun:test';

import type { NewEvent } from './event-catalog';
import { notificationFor } from './notifications';

const ticket = { title: 'Search page' };

function phase(to: Extract<NewEvent, { type: 'phase_changed' }>['payload']['to']): NewEvent {
  return {
    type: 'phase_changed',
    payload: { from: { kind: 'backlog' }, to, action: 'start', board: 'in_progress' },
  };
}

test('a step waiting, failing, refused or paused notifies, named after its ticket', () => {
  expect(notificationFor(phase({ kind: 'awaiting_approval', step: 'summary' }), ticket)).toEqual({
    kind: 'awaiting_approval',
    title: 'Search page',
    detail: 'Summary waits for your approval.',
  });
  expect(
    notificationFor(phase({ kind: 'failed', step: 'implement', error: 'boom' }), ticket)?.detail,
  ).toBe('Implementation failed: boom');
  expect(notificationFor(phase({ kind: 'commit_refused', step: 'implement' }), ticket)?.kind).toBe(
    'commit_refused',
  );
  expect(
    notificationFor(phase({ kind: 'rate_limited', step: 'technical', retryAt: null }), ticket),
  ).toMatchObject({ kind: 'rate_limited', detail: 'Technical is paused by the usage limit.' });
});

test('routine phases and events do not notify', () => {
  expect(notificationFor(phase({ kind: 'running', step: 'intake' }), ticket)).toBeNull();
  expect(notificationFor(phase({ kind: 'done' }), ticket)).toBeNull();
  expect(notificationFor(phase({ kind: 'cancelled' }), ticket)).toBeNull();
  expect(notificationFor({ type: 'run_started', payload: { step: 'intake' } }, ticket)).toBeNull();
  const applied = { deliveryId: 1, ruleId: 2, detail: 'set', error: null };
  expect(
    notificationFor(
      { type: 'event_rule_applied', payload: { ...applied, status: 'succeeded' } },
      ticket,
    ),
  ).toBeNull();
});

test('blocked starts, ended pull requests and failed rules notify', () => {
  expect(
    notificationFor({ type: 'start_blocked', payload: { parent: '#4 Login', parentId: 4 } }, ticket)
      ?.detail,
  ).toBe('Cannot start before #4 Login is done.');
  expect(notificationFor({ type: 'pull_request_merged', payload: { number: 7 } }, ticket)).toEqual({
    kind: 'pull_request_merged',
    title: 'Search page',
    detail: '#7 was merged.',
  });
  expect(
    notificationFor({ type: 'pull_request_closed', payload: { number: 7 } }, ticket)?.kind,
  ).toBe('pull_request_closed');
  expect(
    notificationFor(
      { type: 'pull_request_checks_failed', payload: { number: 7, sha: '2d1d788abcdef' } },
      ticket,
    )?.detail,
  ).toBe('The CI checks of #7 failed on 2d1d788.');
  const failed = notificationFor(
    {
      type: 'event_rule_applied',
      payload: { deliveryId: 1, ruleId: 2, status: 'failed', detail: null, error: 'Notion: 401' },
    },
    ticket,
  );
  expect(failed).toMatchObject({
    kind: 'rule_failed',
    detail: 'An event rule failed: Notion: 401',
  });
});

function ended(status: 'succeeded' | 'failed' | 'cancelled'): NewEvent {
  return { type: 'investigation_finished', payload: { status } };
}

test('an investigation notifies when it ends, unless the user cancelled it', () => {
  const investigation = { title: 'Why is login slow?' };
  expect(notificationFor(ended('succeeded'), investigation)?.kind).toBe('investigation_finished');
  expect(notificationFor(ended('failed'), investigation)?.kind).toBe('investigation_failed');
  expect(notificationFor(ended('cancelled'), investigation)).toBeNull();
});

test('a long error is cut', () => {
  const error = 'x'.repeat(1000);
  const draft = notificationFor(phase({ kind: 'failed', step: 'intake', error }), ticket);
  expect(draft?.detail.length).toBe(300);
  expect(draft?.detail.endsWith('…')).toBe(true);
});

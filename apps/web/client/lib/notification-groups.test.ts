import { describe, expect, test } from 'bun:test';

import type { Notification } from '@union/core';

import { groupNotifications } from './notification-groups';

function make(
  id: number,
  about: { ticketId?: number; investigationId?: number },
  read = false,
): Notification {
  return {
    id,
    projectId: 1,
    ticketId: about.ticketId ?? null,
    investigationId: about.investigationId ?? null,
    kind: 'awaiting_approval',
    ruleId: null,
    title: `n${id}`,
    detail: '',
    eventSeq: id,
    createdAt: id,
    readAt: read ? id : null,
  };
}

describe('groupNotifications', () => {
  test('groups by ticket, newest group first, and collects the unread ids', () => {
    const groups = groupNotifications([
      make(5, { ticketId: 1 }),
      make(4, { ticketId: 2 }),
      make(3, { ticketId: 1 }, true),
      make(2, { ticketId: 1 }),
    ]);
    expect(groups.map((group) => group.latest.id)).toEqual([5, 4]);
    expect(groups[0]?.earlier.map((n) => n.id)).toEqual([3, 2]);
    expect(groups[0]?.unreadIds).toEqual([5, 2]);
  });

  test('keeps investigations apart from tickets with the same id', () => {
    const groups = groupNotifications([make(2, { investigationId: 1 }), make(1, { ticketId: 1 })]);
    expect(groups).toHaveLength(2);
  });
});

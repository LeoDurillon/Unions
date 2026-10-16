// The badge each kind of notification shows: a word for the moment and its tone.
import type { NotificationKind } from '@union/core';

import type { Tone } from '../../lib/labels';

export const KIND_LABELS: Record<NotificationKind, { label: string; tone: Tone }> = {
  awaiting_approval: { label: 'Approval', tone: 'amber' },
  failed: { label: 'Failed', tone: 'red' },
  commit_refused: { label: 'Commit refused', tone: 'red' },
  rate_limited: { label: 'Usage limit', tone: 'amber' },
  start_blocked: { label: 'Blocked', tone: 'amber' },
  pull_request_merged: { label: 'Merged', tone: 'green' },
  pull_request_closed: { label: 'Closed', tone: 'neutral' },
  investigation_finished: { label: 'Answered', tone: 'green' },
  investigation_failed: { label: 'Failed', tone: 'red' },
  rule_failed: { label: 'Rule failed', tone: 'red' },
};

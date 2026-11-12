// The labels and badge tones the investigations pages show for each status and scope.

import type { InvestigationScope, InvestigationStatus } from '@union/core';

import type { Tone } from '../../lib/board/labels';

export const STATUS_LABELS: Record<InvestigationStatus, { label: string; tone: Tone }> = {
  queued: { label: 'Queued', tone: 'neutral' },
  running: { label: 'Running', tone: 'blue' },
  succeeded: { label: 'Answered', tone: 'green' },
  failed: { label: 'Failed', tone: 'red' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

export const SCOPE_LABELS: Record<InvestigationScope, { title: string; description: string }> = {
  repository: {
    title: 'Repository',
    description: 'The agent reads a fresh clone of the project’s repository.',
  },
  ticket: {
    title: 'A ticket',
    description:
      "In the ticket's own workspace, as its agent left it: its branch, uncommitted work, running services. Read only.",
  },
  global: {
    title: 'Global subject',
    description: 'No code checked out: a general question, answered with the agent’s tools.',
  },
};

export function isActive(status: InvestigationStatus): boolean {
  return status === 'queued' || status === 'running';
}

import type { InvestigationScope, InvestigationStatus } from '@union/core';

import type { Tone } from '../../lib/labels';

export const STATUS_LABELS: Record<InvestigationStatus, { label: string; tone: Tone }> = {
  queued: { label: 'queued', tone: 'neutral' },
  running: { label: 'running', tone: 'blue' },
  succeeded: { label: 'done', tone: 'green' },
  failed: { label: 'failed', tone: 'red' },
  cancelled: { label: 'cancelled', tone: 'amber' },
};

export const SCOPE_LABELS: Record<InvestigationScope, { title: string; description: string }> = {
  repository: {
    title: 'Repository',
    description: 'The agent reads a fresh clone of the project’s repository.',
  },
  global: {
    title: 'Global subject',
    description: 'No code checked out: a general question, answered with the agent’s tools.',
  },
};

export function isActive(status: InvestigationStatus): boolean {
  return status === 'queued' || status === 'running';
}

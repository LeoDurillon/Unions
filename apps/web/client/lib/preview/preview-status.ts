// How a preview's status reads on its badge, wherever it shows.

import type { Preview } from '@union/core';

import type { Tone } from '../labels';

export const PREVIEW_STATUS: Record<Preview['status'], { label: string; tone: Tone }> = {
  starting: { label: 'Starting…', tone: 'blue' },
  running: { label: 'Running', tone: 'green' },
  stopping: { label: 'Stopping…', tone: 'blue' },
  stopped: { label: 'Stopped', tone: 'neutral' },
  failed: { label: 'Failed', tone: 'red' },
};

import { expect, test } from 'bun:test';

import type { PreviewView } from '../../src/api-types';
import { previewKey, previewPath, previewPoll, runsPath } from './preview-target';

const REVIEW = { kind: 'pull-request', projectId: 1, number: 7 } as const;
const TICKET = { kind: 'ticket', ticketId: 12 } as const;

function view(values: Partial<PreviewView>): PreviewView {
  return {
    preview: null,
    configured: true,
    composeFile: 'compose.yaml',
    e2eCommand: null,
    e2eRefusal: null,
    refusal: null,
    pending: false,
    ...values,
  };
}

test("a ticket's and a pull request's preview and commands have their own paths and keys", () => {
  expect(previewPath(TICKET)).toBe('/api/tickets/12/preview');
  expect(previewKey(TICKET)).toEqual(['ticket', 12, 'preview']);
  expect(runsPath(TICKET)).toBe('/api/tickets/12/container-runs');
  expect(previewPath(REVIEW)).toBe('/api/projects/1/pull-requests/reviews/7/preview');
  expect(runsPath(REVIEW)).toBe('/api/projects/1/pull-requests/reviews/7/runs');
});

test('a pull request polls while a command waits or a change is on its way; a ticket never', () => {
  const starting = view({ pending: true });
  expect(previewPoll(REVIEW, starting)).toBeGreaterThan(0);
  expect(previewPoll(TICKET, starting)).toBe(false);
  expect(previewPoll(REVIEW, view({}))).toBe(false);
  const preview: NonNullable<PreviewView['preview']> = {
    id: 1,
    ticketId: null,
    reviewId: 3,
    projectId: 1,
    status: 'running',
    url: null,
    urls: null,
    error: null,
    logTail: null,
    logAt: null,
    composeYaml: null,
    composeError: null,
    composeAt: null,
    composeCatalog: null,
    override: null,
    overrideAt: null,
    startedAt: null,
    e2eStatus: 'running',
    e2eOutput: null,
    e2eExitCode: null,
    e2eScreenshots: null,
    e2eAt: null,
    updatedAt: 0,
  };
  expect(previewPoll(REVIEW, view({ preview }))).toBeGreaterThan(0);
  expect(previewPoll(REVIEW, view({ preview: { ...preview, e2eStatus: 'red' } }))).toBe(false);
  expect(
    previewPoll(REVIEW, view({ preview: { ...preview, status: 'starting' } })),
  ).toBeGreaterThan(0);
});

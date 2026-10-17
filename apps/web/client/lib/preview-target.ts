// Where a ticket's or a pull request's preview and commands live in the API, and their query keys.
import type { PreviewView } from '../../src/api-types';
import { request } from './api';
import { reviewBase, type ReviewTarget } from './review-target';

/** A preview's owner as the pages know it: the same targets as a review page's. */
export type PreviewTarget = ReviewTarget;

export function previewPath(target: PreviewTarget): string {
  return `${reviewBase(target)}/preview`;
}

/** A ticket's key is the one its events refresh; a pull request's page polls instead. */
export function previewKey(target: PreviewTarget): readonly unknown[] {
  return target.kind === 'ticket'
    ? ['ticket', target.ticketId, 'preview']
    : ['review', reviewBase(target), 'preview'];
}

export function runsPath(target: PreviewTarget): string {
  return target.kind === 'ticket'
    ? `/api/tickets/${target.ticketId}/container-runs`
    : `${reviewBase(target)}/runs`;
}

export function runsKey(target: PreviewTarget): readonly unknown[] {
  return target.kind === 'ticket'
    ? ['ticket', target.ticketId, 'container-runs']
    : ['review', reviewBase(target), 'runs'];
}

/** The preview's commands; the worker runs each one. */
export function previewCalls(target: PreviewTarget): {
  get: () => Promise<PreviewView>;
  start: () => Promise<PreviewView>;
  stop: () => Promise<PreviewView>;
  logs: () => Promise<PreviewView>;
  e2e: () => Promise<PreviewView>;
  generate: () => Promise<PreviewView>;
  saveOwnFile: (yaml: string | null) => Promise<PreviewView>;
} {
  const path = previewPath(target);
  return {
    get: () => request('GET', path),
    start: () => request('POST', `${path}/start`),
    stop: () => request('POST', `${path}/stop`),
    logs: () => request('POST', `${path}/logs`),
    e2e: () => request('POST', `${path}/e2e`),
    generate: () => request('POST', `${path}/generate`),
    saveOwnFile: (yaml) => request('PUT', `${path}/compose`, { yaml }),
  };
}

const POLL_MS = 1500;

/** While something is on its way, a page without events reads the preview again. */
export function previewPoll(target: PreviewTarget, view: PreviewView | undefined): number | false {
  if (target.kind === 'ticket' || !view) {
    return false;
  }
  const status = view.preview?.status;
  const on =
    view.pending ||
    status === 'starting' ||
    status === 'stopping' ||
    view.preview?.e2eStatus === 'running';
  return on ? POLL_MS : false;
}

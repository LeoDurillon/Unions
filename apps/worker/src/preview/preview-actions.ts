// What each preview command does, for the manager that runs them one at a time per owner.
import type { WorkspaceOwner } from '@union/core';

import type { PreviewAction, PreviewOptions } from '../commands';
import { generatePreviewFile } from './compose-file';
import { resetPreview } from './reset';
import { startOwnerPreview, updateReviewPreview } from './review-preview';
import { refreshPreviewLogs, stopPreview, type PreviewDeps } from './run';

type Action = (
  deps: PreviewDeps,
  owner: WorkspaceOwner,
  options: PreviewOptions,
) => Promise<unknown>;

/**
 * A pull request's start checks it out first; only a pull request's checkout can be updated. A reset
 * drops everything the preview holds and starts it again.
 */
export const ACTIONS: Record<Exclude<PreviewAction, 'e2e'>, Action> = {
  start: startOwnerPreview,
  stop: stopPreview,
  reset: (deps, owner, options) => resetPreview(deps, owner, options.folders),
  logs: refreshPreviewLogs,
  generate: generatePreviewFile,
  update: (deps, owner) =>
    'reviewId' in owner ? updateReviewPreview(deps, owner.reviewId) : Promise.resolve(),
};

// What a pull request under review's Preview tab reads: its preview, its checkout and its commands.
import type { ContainerRun, PreviewScreenshot } from '@union/core';

import type { PreviewView } from './api-types';

/** A pull request's preview: a ticket's view, plus what its own checkout holds. */
export type ReviewPreviewView = PreviewView & {
  /** The commit checked out in its container; null before the first start, test or command. */
  checkoutSha: string | null;
  /** The commit the review reads now: the checkout is behind when they differ. */
  headSha: string | null;
  author: string;
  fromFork: boolean;
  /** Whether its preview gets the project's secrets; null until it is checked out. */
  secrets: boolean | null;
  /** Why the checkout cannot move to the reviewed commit now; null when it can. */
  updateRefusal: string | null;
  /** Why the e2e result cannot be added to the review; null when it can. */
  e2eReviewRefusal: string | null;
  screenshots: Pick<PreviewScreenshot, 'name' | 'size'>[];
};

/** The commands run in a pull request's checkout, newest first; `refusal`: why none can run now. */
export type ReviewRunsView = { runs: ContainerRun[]; refusal: string | null };

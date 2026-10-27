// `<review>/preview`: a pull request's preview, its checkout and its e2e result, as commands the worker runs.
import path from 'node:path';

import {
  getPreview,
  listReviewScreenshots,
  reviewScreenshotsDir,
  setComposeOverride,
  type Db,
} from '@union/core';
import { Hono, type Context } from 'hono';

import { ACCEPTED, CONFLICT, CREATED, fail, NOT_FOUND } from '../http';
import { addGeneralDraft, outputComment } from '../review-output-comment';
import type { ReviewPreviewView } from '../review-preview-types';
import { load, type Review } from './pr-review-load';
import {
  e2eRefusal,
  logsRefusal,
  pendingPreviewCommand,
  previewConfig,
  previewRefusal,
  previewView,
  queuePreviewCommand,
  readOwnFile,
  stopRefusal,
  type PreviewSubject,
} from './preview-subject';

/** Its start checks it out: it needs the commit its files were read at. */
function subjectOf(review: Review): PreviewSubject {
  return {
    owner: { reviewId: review.id },
    projectId: review.projectId,
    noWorkspace: review.headSha
      ? null
      : "Open the pull request's review first: its files are not read yet.",
    e2eBusy: null,
  };
}

function updateRefusal(db: Db, review: Review): string | null {
  if (review.checkoutSha === null) {
    return 'Nothing is checked out yet: start the preview, the tests or a command first.';
  }
  if (review.checkoutSha === review.headSha) {
    return 'The checkout is at the reviewed commit already.';
  }
  return pendingPreviewCommand(db, { reviewId: review.id })
    ? 'The preview is already starting or stopping.'
    : null;
}

function e2eReviewRefusal(db: Db, review: Review): string | null {
  const status = getPreview(db, { reviewId: review.id })?.e2eStatus;
  return status === 'green' || status === 'red' ? null : 'No end-to-end result to add yet.';
}

/** A fork's never; another's once its checkout says the commit is on a branch of the repository. */
function secretsGiven(review: Review): boolean | null {
  if (review.fromFork) {
    return false;
  }
  return review.checkoutSha === null ? null : review.checkoutInRepo;
}

function view(db: Db, review: Review): ReviewPreviewView {
  return {
    ...previewView(db, subjectOf(review)),
    checkoutSha: review.checkoutSha,
    headSha: review.headSha,
    author: review.author,
    fromFork: review.fromFork,
    secrets: secretsGiven(review),
    updateRefusal: updateRefusal(db, review),
    e2eReviewRefusal: e2eReviewRefusal(db, review),
    screenshots: listReviewScreenshots(db, review.id).map(({ name, size }) => ({ name, size })),
  };
}

function command(
  db: Db,
  c: Context,
  type: string,
  check: (review: Review) => string | null,
): Response {
  const { review } = load(db, c);
  const reason = check(review);
  if (reason !== null) {
    throw fail(CONFLICT, reason);
  }
  queuePreviewCommand(db, { reviewId: review.id }, type);
  return c.json(view(db, review), ACCEPTED);
}

/** The last e2e result as a draft comment on the review, for the user to edit before sending. */
function addE2eToReview(db: Db, c: Context): Response {
  const { review } = load(db, c);
  const reason = e2eReviewRefusal(db, review);
  const preview = getPreview(db, { reviewId: review.id });
  if (reason !== null || !preview) {
    throw fail(CONFLICT, reason ?? 'No end-to-end result to add yet.');
  }
  const body = outputComment({
    command: previewConfig(db, subjectOf(review))?.e2eCommand ?? 'the end-to-end tests',
    exitCode: preview.e2eExitCode,
    error: null,
    output: preview.e2eOutput ?? '',
    screenshots: preview.e2eScreenshots ?? 0,
  });
  return c.json(
    addGeneralDraft(db, { kind: 'review', id: review.id }, review.headSha, body),
    CREATED,
  );
}

/** A screenshot of the last failing e2e run, shown as an image: only PNGs are kept. */
function screenshot(db: Db, c: Context): Response {
  const { review } = load(db, c);
  const name = c.req.param('name');
  const kept = listReviewScreenshots(db, review.id).find((shot) => shot.name === name);
  if (!kept) {
    throw fail(NOT_FOUND, 'Screenshot not found');
  }
  return new Response(Bun.file(path.join(reviewScreenshotsDir(review.id), kept.name)), {
    headers: {
      'content-type': 'image/png',
      'content-disposition': 'inline',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'",
    },
  });
}

async function saveOwnFile(db: Db, c: Context): Promise<Response> {
  const { review } = load(db, c);
  setComposeOverride(db, { reviewId: review.id }, await readOwnFile(c));
  return c.json(view(db, review));
}

/**
 * `/api/projects/:projectId/pull-requests/reviews/:number/preview`: the pull request's preview run
 * from its own checkout (the worker runs every command: the web never touches Docker).
 */
export function reviewPreviewRoutes(db: Db): Hono {
  const routes = new Hono();
  routes.get('/', (c) => c.json(view(db, load(db, c).review)));
  routes.post('/start', (c) =>
    command(db, c, 'preview_start', (r) => previewRefusal(db, subjectOf(r))),
  );
  routes.post('/stop', (c) =>
    command(db, c, 'preview_stop', (r) => stopRefusal(db, { reviewId: r.id })),
  );
  routes.post('/e2e', (c) => command(db, c, 'preview_e2e', (r) => e2eRefusal(db, subjectOf(r))));
  routes.post('/generate', (c) =>
    command(db, c, 'preview_generate', (r) =>
      r.checkoutSha === null
        ? 'Start the preview once first: the start checks the pull request out.'
        : previewRefusal(db, subjectOf(r)),
    ),
  );
  routes.post('/logs', (c) =>
    command(db, c, 'preview_logs', (r) => logsRefusal(db, { reviewId: r.id })),
  );
  routes.post('/update', (c) =>
    command(db, c, 'review_checkout_update', (r) => updateRefusal(db, r)),
  );
  routes.put('/compose', (c) => saveOwnFile(db, c));
  routes.post('/e2e/review', (c) => addE2eToReview(db, c));
  routes.get('/screenshots/:name', (c) => screenshot(db, c));
  return routes;
}

// A pull request under review's Preview tab: its own checkout's preview, end-to-end tests and commands.
import type { ProjectScript } from '@union/core';
import { useState, type ReactElement } from 'react';

import type { ReviewPreviewView } from '../../../src/review-preview-types';
import {
  useCheckoutUpdate,
  useReviewPreview,
  type PullRequestTarget,
} from '../../lib/use-review-preview';
import { ContainerCommands } from '../container-commands';
import { PreviewSection } from '../preview-section';
import type { ReviewSection } from '../review/review-page';
import { Button, ErrorText } from '../ui';

const SHORT_SHA = 7;

function short(sha: string): string {
  return sha.slice(0, SHORT_SHA);
}

/** Whose code runs, and whether it gets the project's secret variables. */
function secretsLine(view: ReviewPreviewView): string {
  if (view.fromFork) {
    return "It comes from a fork: the project's secret variables are never given to it.";
  }
  if (view.secrets === false) {
    return "Its commit is not on a branch of the repository: the project's secret variables are left out.";
  }
  return view.secrets
    ? "Its commit is on a branch of the repository: it gets the project's secret variables."
    : "It gets the project's secret variables only if its commit is on a branch of the repository.";
}

/** The checkout behind the review: Update discards what ran there, and the preview's data. */
function Behind({
  target,
  view,
}: {
  target: PullRequestTarget;
  view: ReviewPreviewView;
}): ReactElement | null {
  const update = useCheckoutUpdate(target);
  const [confirming, setConfirming] = useState(false);
  const { checkoutSha, headSha } = view;
  if (checkoutSha === null || headSha === null || checkoutSha === headSha) {
    return checkoutSha === null ? null : <p>Checked out at {short(checkoutSha)}.</p>;
  }
  return (
    <div className="space-y-1 rounded-md bg-amber-50 p-2 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
      <p>
        The checkout is at {short(checkoutSha)}; the review reads {short(headSha)}. Updating
        replaces the checkout (what commands changed there goes) and restarts the preview with fresh
        data.
      </p>
      <div className="flex flex-wrap gap-2">
        {confirming ? (
          <>
            <Button
              variant="primary"
              disabled={update.isPending}
              onClick={() => {
                update.mutate();
                setConfirming(false);
              }}
            >
              Discard and update
            </Button>
            <Button
              onClick={() => {
                setConfirming(false);
              }}
            >
              Keep it
            </Button>
          </>
        ) : (
          <Button
            disabled={view.updateRefusal !== null}
            title={view.updateRefusal ?? undefined}
            onClick={() => {
              setConfirming(true);
            }}
          >
            Update to the reviewed commit
          </Button>
        )}
      </div>
      <ErrorText error={update.error} />
    </div>
  );
}

function CheckoutNotice({ target }: { target: PullRequestTarget }): ReactElement | null {
  const view = useReviewPreview(target).data;
  if (!view) {
    return null;
  }
  return (
    <div className="space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
      <p>
        Runs the code of <strong>@{view.author}</strong> on this machine, from its own checkout of
        the pull request (no GitHub or Claude credentials in it). {secretsLine(view)}
      </p>
      <Behind target={target} view={view} />
    </div>
  );
}

/** The pull request's preview, its end-to-end tests and its commands; their output can go to the review. */
function ReviewPreviewTab({
  target,
  scripts,
}: {
  target: PullRequestTarget;
  scripts: readonly ProjectScript[];
}): ReactElement {
  return (
    <div className="space-y-4">
      <PreviewSection target={target} notice={<CheckoutNotice target={target} />} />
      <ContainerCommands
        target={target}
        scripts={scripts}
        intro={
          <>
            Runs in the pull request&apos;s own checkout, in the repository (no GitHub or Claude
            credentials, never the secret variables), with <code>PREVIEW_URL</code> while the
            preview runs. A typed command stops after 10 minutes.
          </>
        }
      />
    </div>
  );
}

/** The Preview tab among a pull request review's sections, after its description and comments. */
export function reviewPreviewSection(
  target: PullRequestTarget,
  scripts: readonly ProjectScript[],
): ReviewSection {
  return {
    id: 'preview',
    label: 'Preview',
    content: <ReviewPreviewTab target={target} scripts={scripts} />,
  };
}

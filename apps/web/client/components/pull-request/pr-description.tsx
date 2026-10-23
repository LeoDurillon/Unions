// A pull request's description, the same for the ticket's and each slice's: GitHub's text, and the agent's rewrite of it to edit and send.
import type { ReactElement } from 'react';

import type { PrDescriptionDraft, PrDescriptionView } from '../../../src/api-types';
import { usePrDescription, type DescriptionActions } from '../../lib/use-pr-description';
import { Button, ErrorText } from '../ui';
import { DescriptionDraft } from './description-draft';
import { GitHubDescription } from './github-description';

/** What a rewrite covers: one pull request, or each open slice's of a split ticket. */
export type RewriteScope = { pullRequests: number };

function rewriteLabel(scope: RewriteScope | null, again: boolean): string {
  const count = scope?.pullRequests ?? 1;
  if (count > 1) {
    return `Rewrite all ${count} descriptions${again ? ' again' : ''}`;
  }
  return again ? 'Rewrite again' : 'Rewrite description';
}

function RewriteButton({
  view,
  actions,
  scope,
}: {
  view: PrDescriptionView;
  actions: DescriptionActions;
  scope: RewriteScope;
}): ReactElement {
  const hint =
    scope.pullRequests > 1
      ? "The agent rewrites each open slice's description, one after the other; review each one in its pull request here"
      : undefined;
  return (
    <Button
      disabled={actions.busy || view.refusal !== null}
      title={view.refusal ?? hint}
      onClick={actions.handleRewrite}
    >
      {rewriteLabel(scope, false)}
    </Button>
  );
}

/** What the latest rewrite left to say, when it is not a draft to edit. */
function lastOutcome(draft: PrDescriptionDraft | null): string | null {
  if (draft?.status === 'sent' && draft.sentAt !== null) {
    return `Rewritten and updated on GitHub ${new Date(draft.sentAt).toLocaleString()}.`;
  }
  return draft?.status === 'cancelled' ? 'The last rewrite was cancelled.' : null;
}

function Working({
  draft,
  actions,
}: {
  draft: PrDescriptionDraft;
  actions: DescriptionActions;
}): ReactElement {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-zinc-500">
        {draft.status === 'queued'
          ? 'Waiting for its turn…'
          : 'The agent is rewriting this description…'}
      </span>
      <Button disabled={actions.busy} onClick={actions.handleCancel}>
        Cancel
      </Button>
    </div>
  );
}

function Idle({
  view,
  actions,
  scope,
}: {
  view: PrDescriptionView;
  actions: DescriptionActions;
  scope: RewriteScope;
}): ReactElement {
  const outcome = lastOutcome(view.draft);
  return (
    <div className="space-y-2 text-sm">
      {outcome ? <p className="text-zinc-500">{outcome}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <RewriteButton view={view} actions={actions} scope={scope} />
        {view.draft?.status === 'conflict' ? (
          <Button disabled={actions.busy} onClick={actions.handleDiscard}>
            Discard the draft
          </Button>
        ) : null}
      </div>
      {view.refusal ? <p className="text-xs text-zinc-500">{view.refusal}</p> : null}
    </div>
  );
}

type BodyProps = {
  ticketId: number;
  pr: number;
  view: PrDescriptionView | undefined;
  actions: DescriptionActions;
  scope: RewriteScope | null;
};

/** A draft in the works or to review replaces GitHub's text; else GitHub's text and Rewrite. */
function Body({ ticketId, pr, view, actions, scope }: BodyProps): ReactElement {
  const draft = view?.draft;
  if (draft?.status === 'queued' || draft?.status === 'running') {
    return <Working draft={draft} actions={actions} />;
  }
  if (draft?.status === 'ready' || draft?.status === 'sending') {
    return (
      <DescriptionDraft
        key={draft.id}
        draft={draft}
        busy={actions.busy}
        onSend={actions.handleSend}
        onDiscard={actions.handleDiscard}
        onRewrite={actions.handleRewrite}
        rewriteLabel={rewriteLabel(scope, true)}
      />
    );
  }
  return (
    <>
      <GitHubDescription ticketId={ticketId} pr={pr} />
      {view && scope ? <Idle view={view} actions={actions} scope={scope} /> : null}
    </>
  );
}

/** The notes above the section: the description may be out of date, the last rewrite's error. */
function notices(view: PrDescriptionView | undefined): { outdated: boolean; error: string | null } {
  const draft = view?.draft;
  const showsError =
    draft?.status === 'failed' || draft?.status === 'conflict' || draft?.status === 'ready';
  return {
    outdated: view?.outdated === true && draft?.status !== 'ready',
    error: showsError ? (draft.error ?? null) : null,
  };
}

/**
 * `pr`'s description. The agent's draft is the user's to edit, send or discard: nothing reaches
 * GitHub before "Update on GitHub". `scope` null: no rewrite (the pull request is merged).
 */
export function PrDescription({
  ticketId,
  pr,
  scope,
}: {
  ticketId: number;
  pr: number;
  scope: RewriteScope | null;
}): ReactElement {
  const { view, error, actions } = usePrDescription(ticketId, pr);
  const notice = notices(view);
  return (
    <section className="space-y-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
      <h3 className="text-sm font-semibold">Description of #{pr}</h3>
      {notice.outdated && scope ? (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          The branch was pushed again after the description was written: it may be out of date.
        </p>
      ) : null}
      <ErrorText error={error ?? actions.error} />
      {notice.error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{notice.error}</p>
      ) : null}
      <Body ticketId={ticketId} pr={pr} view={view} actions={actions} scope={scope} />
    </section>
  );
}

// A pull request's description, the same for the ticket's and each slice's: GitHub's text, and the agent's rewrite of it to edit and send.
import type { ReactElement } from 'react';

import type { PrDescriptionDraft, PrDescriptionView } from '../../../src/api-types';
import { usePrDescription, type DescriptionActions } from '../../lib/use-pr-description';
import { Button, ErrorText } from '../ui';
import { DescriptionDraft } from './description-draft';
import { GitHubDescription } from './github-description';

/**
 * Where the rewrite is asked: `here`, or `stack` (a split ticket's, for every slice at once, in the
 * stack panel); null: none (the pull request is merged).
 */
export type RewriteFrom = 'here' | 'stack' | null;

function RewriteButton({
  view,
  actions,
}: {
  view: PrDescriptionView;
  actions: DescriptionActions;
}): ReactElement {
  return (
    <Button
      disabled={actions.busy || view.refusal !== null}
      title={view.refusal ?? undefined}
      onClick={actions.handleRewrite}
    >
      Rewrite description
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
  from,
}: {
  view: PrDescriptionView;
  actions: DescriptionActions;
  from: RewriteFrom;
}): ReactElement {
  const outcome = lastOutcome(view.draft);
  return (
    <div className="space-y-2 text-sm">
      {outcome ? <p className="text-zinc-500">{outcome}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        {from === 'here' ? (
          <RewriteButton view={view} actions={actions} />
        ) : (
          <span className="text-xs text-zinc-500">
            Rewrite all descriptions from the stack above.
          </span>
        )}
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
  from: RewriteFrom;
};

/** A draft in the works or to review replaces GitHub's text; else GitHub's text and Rewrite. */
function Body({ ticketId, pr, view, actions, from }: BodyProps): ReactElement {
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
        rewriteLabel={from === 'here' ? 'Rewrite again' : null}
      />
    );
  }
  return <Current ticketId={ticketId} pr={pr} view={view} actions={actions} from={from} />;
}

/** No draft: GitHub's text, and what rewriting it takes. */
function Current({ ticketId, pr, view, actions, from }: BodyProps): ReactElement {
  return (
    <>
      <GitHubDescription ticketId={ticketId} pr={pr} />
      {view && from !== null ? <Idle view={view} actions={actions} from={from} /> : null}
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
 * GitHub before "Update on GitHub".
 */
export function PrDescription({
  ticketId,
  pr,
  from,
}: {
  ticketId: number;
  pr: number;
  from: RewriteFrom;
}): ReactElement {
  const { view, error, actions } = usePrDescription(ticketId, pr);
  const notice = notices(view);
  return (
    <section className="space-y-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
      <h3 className="text-sm font-semibold">Description of #{pr}</h3>
      {notice.outdated && from !== null ? (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          The branch was pushed again after the description was written: it may be out of date.
        </p>
      ) : null}
      <ErrorText error={error ?? actions.error} />
      {notice.error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{notice.error}</p>
      ) : null}
      <Body ticketId={ticketId} pr={pr} view={view} actions={actions} from={from} />
    </section>
  );
}

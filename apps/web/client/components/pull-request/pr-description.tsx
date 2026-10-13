import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactElement } from 'react';

import type { PrDescriptionDraft, PrDescriptionView } from '../../../src/api-types';
import { prDescriptionApi } from '../../lib/pr-description-api';
import { Button, ErrorText } from '../ui';
import { DescriptionDraft } from './description-draft';

type Actions = {
  handleRewrite: () => void;
  handleSend: (text: string) => void;
  handleDiscard: () => void;
  handleCancel: () => void;
  busy: boolean;
  error: Error | null;
};

/** Under `['ticket', id]`: the live events about the ticket refresh it. */
function useDescription(ticketId: number): {
  view: PrDescriptionView | undefined;
  error: Error | null;
  actions: Actions;
} {
  const queryClient = useQueryClient();
  const queryKey = ['ticket', ticketId, 'pr-description'];
  const query = useQuery({ queryKey, queryFn: () => prDescriptionApi.get(ticketId) });
  const draftId = query.data?.draft?.id ?? 0;
  const mutation = useMutation({
    mutationFn: (run: () => Promise<PrDescriptionView>) => run(),
    onSuccess: (view) => {
      queryClient.setQueryData(queryKey, view);
    },
  });
  const run = (call: () => Promise<PrDescriptionView>): void => {
    mutation.mutate(call);
  };
  return {
    view: query.data,
    error: query.error,
    actions: {
      handleRewrite: () => {
        run(() => prDescriptionApi.rewrite(ticketId));
      },
      handleSend: (text) => {
        run(() => prDescriptionApi.send(ticketId, draftId, text));
      },
      handleDiscard: () => {
        run(() => prDescriptionApi.discard(ticketId, draftId));
      },
      handleCancel: () => {
        run(() => prDescriptionApi.cancel(ticketId, draftId));
      },
      busy: mutation.isPending,
      error: mutation.error,
    },
  };
}

function RewriteButton({
  view,
  actions,
  label,
}: {
  view: PrDescriptionView;
  actions: Actions;
  label: string;
}): ReactElement {
  return (
    <Button
      disabled={actions.busy || view.refusal !== null}
      title={view.refusal ?? undefined}
      onClick={actions.handleRewrite}
    >
      {label}
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
  actions: Actions;
}): ReactElement {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-zinc-500">
        {draft.status === 'queued'
          ? 'Waiting for a free agent slot…'
          : 'The agent is rewriting the description…'}
      </span>
      <Button disabled={actions.busy} onClick={actions.handleCancel}>
        Cancel
      </Button>
    </div>
  );
}

function Idle({ view, actions }: { view: PrDescriptionView; actions: Actions }): ReactElement {
  const outcome = lastOutcome(view.draft);
  return (
    <div className="space-y-2 text-sm">
      {outcome ? <p className="text-zinc-500">{outcome}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <RewriteButton view={view} actions={actions} label="Rewrite description" />
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

function Body({ view, actions }: { view: PrDescriptionView; actions: Actions }): ReactElement {
  const { draft } = view;
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
      />
    );
  }
  return <Idle view={view} actions={actions} />;
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
 * The PR's description, rewritten by the agent when the work changed after the PR was opened. The
 * draft is the user's to edit, send or discard: nothing reaches GitHub before "Update on GitHub".
 */
export function PrDescription({ ticketId }: { ticketId: number }): ReactElement {
  const { view, error, actions } = useDescription(ticketId);
  const notice = notices(view);
  return (
    <section className="space-y-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
      <h3 className="text-sm font-semibold">Description</h3>
      {notice.outdated ? (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          The branch was pushed again after the description was written: it may be out of date.
        </p>
      ) : null}
      <ErrorText error={error ?? actions.error} />
      {notice.error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{notice.error}</p>
      ) : null}
      {view ? <Body view={view} actions={actions} /> : null}
    </section>
  );
}

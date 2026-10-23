// The pull request's CI checks on its last commit, and its bot comments: the failed ones and what explains them can be given to the implementer.
import { useState, type ReactElement } from 'react';

import type { CiPick, PrChecksView, PullRequestCheck } from '../../../src/ci-api-types';
import { useCiRerun, type CiRerun } from '../../lib/use-ci-rerun';
import { usePrChecks } from '../../lib/use-pr-checks';
import { Button, ErrorText } from '../ui';
import { BotCommentRow, CheckRow, pickKey, RelatedJobs, type Picking } from './ci-check-rows';
import { CiGiven } from './ci-given';
import { CiPickActions } from './ci-pick-actions';

const SHA_SHOWN = 7;

function usePicking(): Picking & { picks: CiPick[]; clear: () => void } {
  const [picks, setPicks] = useState<CiPick[]>([]);
  const picked = new Set(picks.map((pick) => pickKey(pick)));
  return {
    picks,
    picked,
    toggle: (pick) => {
      setPicks((old) =>
        old.some((one) => pickKey(one) === pickKey(pick))
          ? old.filter((one) => pickKey(one) !== pickKey(pick))
          : [...old, pick],
      );
    },
    clear: () => {
      setPicks([]);
    },
  };
}

function counts(checks: readonly PullRequestCheck[]): string {
  const of = (state: PullRequestCheck['state']): number =>
    checks.filter((check) => check.state === state).length;
  const parts = [
    `${of('failed')} failed`,
    `${of('pending')} running`,
    `${of('passed')} passed`,
    `${of('skipped')} skipped`,
  ];
  return parts.filter((part) => !part.startsWith('0 ')).join(', ') || 'no checks';
}

function CheckLists({
  view,
  picking,
  rerun,
}: {
  view: PrChecksView;
  picking: Picking;
  rerun: CiRerun;
}): ReactElement {
  const failed = view.checks.filter((check) => check.state === 'failed');
  const pending = view.checks.filter((check) => check.state === 'pending');
  const rest = view.checks.filter((check) => check.state === 'passed' || check.state === 'skipped');
  return (
    <>
      <ul className="space-y-1">
        {failed.map((check) => (
          <div key={check.id} className="space-y-1">
            <CheckRow check={check} picking={picking} rerun={rerun} />
            <RelatedJobs check={check} checks={view.checks} picking={picking} />
          </div>
        ))}
        {pending.map((check) => (
          <CheckRow key={check.id} check={check} />
        ))}
      </ul>
      {rest.length > 0 ? (
        <details>
          <summary className="cursor-pointer text-xs text-zinc-500">
            Passed and skipped ({rest.length})
          </summary>
          <ul className="mt-1 space-y-1">
            {rest.map((check) => (
              <CheckRow key={check.id} check={check} />
            ))}
          </ul>
        </details>
      ) : null}
      {view.botComments.length > 0 ? (
        <details open={failed.length > 0}>
          <summary className="cursor-pointer text-xs text-zinc-500">
            Bot comments on the pull request ({view.botComments.length}): reports often hold the
            findings
          </summary>
          <ul className="mt-1 space-y-1">
            {view.botComments.map((comment) => (
              <BotCommentRow key={comment.id} comment={comment} picking={picking} />
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );
}

/** Read from GitHub when the tab opens, every 30 s while a check runs, and on Refresh. */
export function CiChecks({ ticketId, pr }: { ticketId: number; pr: number }): ReactElement {
  const { checks, preview, keep, send, drop } = usePrChecks(ticketId, pr);
  const picking = usePicking();
  const rerun = useCiRerun(ticketId, pr, checks.refetch);
  const view = checks.data;
  const handleDone = (): void => {
    picking.clear();
  };
  return (
    <section className="space-y-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-medium">CI checks</h3>
        {view ? (
          <span className="text-xs text-zinc-500">
            {counts(view.checks)} on <code>{view.headSha.slice(0, SHA_SHOWN)}</code>
          </span>
        ) : null}
        <Button
          className="ml-auto"
          disabled={checks.isFetching}
          onClick={() => {
            void checks.refetch();
          }}
        >
          {checks.isFetching ? 'Reading…' : 'Refresh'}
        </Button>
      </div>
      <ErrorText error={checks.error} />
      <ErrorText error={rerun.error} />
      {view ? (
        <>
          <CheckLists view={view} picking={picking} rerun={rerun} />
          <CiPickActions
            picks={picking.picks}
            canSend={view.canSend}
            hooks={{ preview, keep, send }}
            onDone={handleDone}
          />
          <CiGiven given={view.given} headSha={view.headSha} drop={drop} />
        </>
      ) : null}
    </section>
  );
}

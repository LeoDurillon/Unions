// One line per CI check or bot comment of the pull request, with a box to pick it for the implementer and, on a failed Actions job, Re-run.
import type { ReactElement } from 'react';

import type { BotComment, CiPick, PullRequestCheck } from '../../../src/ci-api-types';
import type { Tone } from '../../lib/labels';
import type { CiRerun } from '../../lib/use-ci-rerun';
import { Badge, Button } from '../ui';

const STATE_TONES: Record<PullRequestCheck['state'], Tone> = {
  failed: 'red',
  pending: 'amber',
  passed: 'green',
  skipped: 'neutral',
};
const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;

export function pickKey(pick: CiPick): string {
  return `${pick.kind}|${pick.id}`;
}

export type Picking = { picked: ReadonlySet<string>; toggle: (pick: CiPick) => void };

function PickBox({
  pick,
  label,
  picking,
}: {
  pick: CiPick;
  label: string;
  picking: Picking;
}): ReactElement {
  return (
    <input
      type="checkbox"
      aria-label={`Give ${label} to the agent`}
      checked={picking.picked.has(pickKey(pick))}
      onChange={() => {
        picking.toggle(pick);
      }}
    />
  );
}

function duration(ms: number | null): string {
  if (ms === null) {
    return '';
  }
  const seconds = Math.round(ms / MS_PER_SECOND);
  return seconds < SECONDS_PER_MINUTE
    ? `${seconds}s`
    : `${Math.floor(seconds / SECONDS_PER_MINUTE)}m ${seconds % SECONDS_PER_MINUTE}s`;
}

function Name({ name, url }: { name: string; url: string | null }): ReactElement {
  return url === null ? (
    <span className="truncate">{name}</span>
  ) : (
    <a className="truncate hover:underline" href={url} target="_blank" rel="noreferrer">
      {name}
    </a>
  );
}

/** GitHub runs a failed Actions job again; other CI is re-run where it runs. */
function RerunButton({
  check,
  rerun,
}: {
  check: PullRequestCheck;
  rerun: CiRerun;
}): ReactElement | null {
  if (check.state !== 'failed' || check.workflowRunId === null) {
    return null;
  }
  const asked = rerun.isAsked(check.id);
  let label = 'Re-run';
  if (asked) {
    label = 'Re-run asked';
  } else if (rerun.sending === check.id) {
    label = 'Asking…';
  }
  return (
    <Button
      className="shrink-0 px-2 py-0.5 text-xs"
      disabled={asked || rerun.sending !== null}
      title="Run this job again on GitHub, with the jobs that depend on it"
      onClick={() => {
        rerun.ask(check.id);
      }}
    >
      {label}
    </Button>
  );
}

/** A check: picked as a failure when it failed, as another job's log for `asJob`. */
export function CheckRow({
  check,
  picking,
  rerun,
  asJob = false,
}: {
  check: PullRequestCheck;
  picking?: Picking;
  rerun?: CiRerun;
  asJob?: boolean;
}): ReactElement {
  const pick: CiPick = asJob
    ? { kind: 'job', id: check.id.slice('run:'.length) }
    : { kind: 'check', id: check.id };
  return (
    <li className="flex items-center gap-2 text-sm">
      {picking ? <PickBox pick={pick} label={check.name} picking={picking} /> : null}
      <Badge tone={STATE_TONES[check.state]}>{check.conclusion ?? check.state}</Badge>
      <Name name={check.name} url={check.url} />
      {check.summary ? (
        <span className="truncate text-xs text-zinc-500">{check.summary}</span>
      ) : null}
      <span className="ml-auto shrink-0 text-xs text-zinc-500">{duration(check.durationMs)}</span>
      {rerun ? <RerunButton check={check} rerun={rerun} /> : null}
    </li>
  );
}

/** The other jobs of a failed Actions job's workflow run: the findings are often in their logs. */
export function RelatedJobs({
  check,
  checks,
  picking,
}: {
  check: PullRequestCheck;
  checks: readonly PullRequestCheck[];
  picking: Picking;
}): ReactElement | null {
  const jobs = checks.filter(
    (one) =>
      one.workflowRunId !== null &&
      one.workflowRunId === check.workflowRunId &&
      one.id !== check.id &&
      one.state !== 'skipped',
  );
  if (jobs.length === 0) {
    return null;
  }
  return (
    <details className="ml-6 text-sm">
      <summary className="cursor-pointer text-xs text-zinc-500">
        Other jobs of its workflow run ({jobs.length}): add a log
      </summary>
      <ul className="mt-1 space-y-1">
        {jobs.map((job) => (
          <CheckRow key={job.id} check={job} picking={picking} asJob />
        ))}
      </ul>
    </details>
  );
}

export function BotCommentRow({
  comment,
  picking,
}: {
  comment: BotComment;
  picking: Picking;
}): ReactElement {
  const label = `${comment.author}'s comment`;
  return (
    <li className="flex items-start gap-2 text-sm">
      <PickBox pick={{ kind: 'comment', id: String(comment.id) }} label={label} picking={picking} />
      <div className="min-w-0">
        <a
          className="font-medium hover:underline"
          href={comment.url}
          target="_blank"
          rel="noreferrer"
        >
          {comment.author}
        </a>
        <span className="ml-2 text-xs text-zinc-500">
          {new Date(comment.updatedAt).toLocaleString()}
        </span>
        <p className="truncate text-xs text-zinc-500">{comment.excerpt.split('\n')[0]}</p>
      </div>
    </li>
  );
}

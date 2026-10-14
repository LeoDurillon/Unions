import { useState, type ReactElement } from 'react';

import { SINCE_REVIEW, type CommitsResponse, type ReviewCommit } from '../../../src/api-types';
import { useCommits } from '../../lib/use-commits';
import { ErrorText } from '../ui';

const SHORT_SHA = 7;
const ROW = 'block w-full rounded px-2 py-1 text-left text-xs';
const ROW_ON = 'bg-indigo-100 font-medium dark:bg-indigo-950';
const ROW_OFF = 'hover:bg-zinc-100 dark:hover:bg-zinc-800';
const STEP =
  'rounded border border-zinc-300 px-1.5 text-xs disabled:opacity-40 dark:border-zinc-700';

function commitLine(commit: ReviewCommit): string {
  return `${commit.sha.slice(0, SHORT_SHA)} ${commit.title}`;
}

function CommitRow({
  commit,
  index,
  on,
  onPick,
}: {
  commit: ReviewCommit;
  index: number;
  on: boolean;
  onPick: () => void;
}): ReactElement {
  const date = commit.date ? ` · ${new Date(commit.date).toLocaleString()}` : '';
  return (
    <button
      type="button"
      aria-pressed={on}
      title={commit.body === '' ? commit.title : `${commit.title}\n\n${commit.body}`}
      className={`${ROW} ${on ? ROW_ON : ROW_OFF}`}
      onClick={onPick}
    >
      <span className="block truncate">
        {index + 1}. {commit.title}
      </span>
      <span className="block truncate text-zinc-500">
        {commit.sha.slice(0, SHORT_SHA)} · {commit.author}
        {date}
        {commit.parents > 1 ? ' · merge' : ''}
      </span>
    </button>
  );
}

/** Previous and next: step through the commits in order, from "All changes" to the first. */
function StepButtons({
  list,
  at,
  onPick,
}: {
  list: ReviewCommit[];
  at: number;
  onPick: (sha: string | null) => void;
}): ReactElement {
  return (
    <>
      <button
        type="button"
        aria-label="Previous commit"
        className={STEP}
        disabled={at <= 0}
        onClick={() => {
          onPick(list[at - 1]?.sha ?? null);
        }}
      >
        ‹
      </button>
      <button
        type="button"
        aria-label="Next commit"
        className={STEP}
        disabled={list.length === 0 || at === list.length - 1}
        onClick={() => {
          onPick(list[at + 1]?.sha ?? null);
        }}
      >
        ›
      </button>
    </>
  );
}

function sinceLabel(since: NonNullable<CommitsResponse['sinceReview']>): string {
  return `Since last review · ${since.commits} commit${since.commits === 1 ? '' : 's'}`;
}

/** What the picker's button says: the whole change, the change since the review, or a commit. */
function pickedLabel(value: string | null, data: CommitsResponse | undefined): string {
  if (value === SINCE_REVIEW && data?.sinceReview) {
    return sinceLabel(data.sinceReview);
  }
  const commit = data?.commits.find((candidate) => candidate.sha === value);
  return commit ? commitLine(commit) : 'All changes';
}

function PlainRow({
  on,
  label,
  onPick,
}: {
  on: boolean;
  label: string;
  onPick: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      aria-pressed={on}
      className={`${ROW} ${on ? ROW_ON : ROW_OFF}`}
      onClick={onPick}
    >
      {label}
    </button>
  );
}

function CommitList({
  data,
  value,
  onPick,
}: {
  data: CommitsResponse;
  value: string | null;
  onPick: (sha: string | null) => void;
}): ReactElement {
  const { commits, sinceReview } = data;
  return (
    <div className="max-h-72 space-y-0.5 overflow-y-auto">
      <PlainRow
        on={value === null}
        label={`All changes · ${commits.length} commit${commits.length === 1 ? '' : 's'}`}
        onPick={() => {
          onPick(null);
        }}
      />
      {sinceReview ? (
        <PlainRow
          on={value === SINCE_REVIEW}
          label={sinceLabel(sinceReview)}
          onPick={() => {
            onPick(SINCE_REVIEW);
          }}
        />
      ) : null}
      {commits.map((commit, index) => (
        <CommitRow
          key={commit.sha}
          commit={commit}
          index={index}
          on={commit.sha === value}
          onPick={() => {
            onPick(commit.sha);
          }}
        />
      ))}
    </div>
  );
}

/**
 * All the changes, the change since the last review (tickets), or one commit: a button that opens
 * the list, and previous and next to step through the commits in order. Hidden when the change has
 * no commits to show (a ticket's diff taken before commits were kept).
 */
export function CommitPicker({
  base,
  value,
  onChange,
}: {
  /** The review's API root. */
  base: string;
  value: string | null;
  onChange: (sha: string | null) => void;
}): ReactElement | null {
  const commits = useCommits(base);
  const [open, setOpen] = useState(false);
  const list = commits.data?.commits ?? [];
  if (commits.data && list.length === 0 && value === null) {
    return null;
  }
  const at = list.findIndex((commit) => commit.sha === value);
  const pick = (sha: string | null): void => {
    onChange(sha);
    setOpen(false);
  };
  return (
    <div className="space-y-1 border-b border-zinc-200 px-2 pb-2 dark:border-zinc-800">
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-expanded={open}
          className="min-w-0 flex-1 truncate rounded px-1 py-0.5 text-left text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800"
          onClick={() => {
            setOpen(!open);
          }}
        >
          {pickedLabel(value, commits.data)} ▾
        </button>
        <StepButtons list={list} at={at} onPick={pick} />
      </div>
      <ErrorText error={commits.error} />
      {open && commits.data ? <CommitList data={commits.data} value={value} onPick={pick} /> : null}
    </div>
  );
}

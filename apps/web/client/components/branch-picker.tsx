// The repository's branches under a filter box: a ticket's base branch or new target, the branch the Repository
// tab shows.
import { useQuery } from '@tanstack/react-query';
import { useState, type ReactElement } from 'react';

import { api } from '../lib/api';
import { ErrorText, inputClass } from './ui';

const ROW_ON = 'bg-indigo-50 text-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-100';
const ROW_OFF = 'hover:bg-zinc-100 dark:hover:bg-zinc-800';
const BRANCHES_STALE_MS = 60_000;

/** A name typed that is not listed, as the ticket's pickers word it. */
function typedUse(name: string): string {
  return `Use "${name}"`;
}

/** What a branch list shows: the names once read, or why they are not. */
export type BranchListing = { data?: string[]; error: Error | null; isPending: boolean };

/** Branches under a filter box; a name typed that is not listed can be used too (`typedLabel` words it). */
export function BranchList({
  label,
  listed,
  value,
  onPick,
  typedLabel = typedUse,
}: {
  label: string;
  listed: BranchListing;
  value: string | null;
  onPick: (branch: string) => void;
  typedLabel?: (name: string) => string;
}): ReactElement {
  const [filter, setFilter] = useState('');
  const needle = filter.trim();
  const branches = (listed.data ?? []).filter((branch) =>
    branch.toLowerCase().includes(needle.toLowerCase()),
  );
  const typed = needle !== '' && !branches.includes(needle) ? [needle] : [];
  return (
    <div className="space-y-1">
      <input
        aria-label="Filter branches"
        className={inputClass}
        value={filter}
        placeholder="Filter branches…"
        onChange={(event) => {
          setFilter(event.target.value);
        }}
      />
      <ErrorText error={listed.error} />
      <fieldset
        aria-label={label}
        className="max-h-56 overflow-y-auto rounded-md border border-zinc-300 dark:border-zinc-700"
      >
        {listed.isPending ? <p className="px-3 py-2 text-sm text-zinc-500">Loading…</p> : null}
        {[...typed, ...branches].map((branch) => (
          <label
            key={branch}
            className={`relative block cursor-pointer px-3 py-1.5 font-mono text-xs has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-indigo-500 has-[:focus-visible]:ring-inset ${branch === value ? ROW_ON : ROW_OFF}`}
          >
            <input
              type="radio"
              name={label}
              className="sr-only"
              checked={branch === value}
              onChange={() => {
                onPick(branch);
              }}
            />
            {typed.includes(branch) ? typedLabel(branch) : branch}
          </label>
        ))}
      </fieldset>
    </div>
  );
}

/** A ticket's repository's branches under a filter box, to pick its base branch or a new target. */
export function BranchPicker({
  label,
  ticketId,
  value,
  onPick,
}: {
  label: string;
  ticketId: number;
  value: string | null;
  onPick: (branch: string) => void;
}): ReactElement {
  const listed = useQuery({
    queryKey: ['branches', ticketId],
    queryFn: () => api.branches(ticketId),
    staleTime: BRANCHES_STALE_MS,
    select: (data) => data.branches,
  });
  return <BranchList label={label} listed={listed} value={value} onPick={onPick} />;
}

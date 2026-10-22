// The repository's branches under a filter box, to pick a ticket's base branch or a new target.
import { useQuery } from '@tanstack/react-query';
import { useState, type ReactElement } from 'react';

import { api } from '../lib/api';
import { ErrorText, inputClass } from './ui';

const ROW_ON = 'bg-indigo-50 text-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-100';
const ROW_OFF = 'hover:bg-zinc-100 dark:hover:bg-zinc-800';
const BRANCHES_STALE_MS = 60_000;

/** The repository's branches under a filter box; a name typed that is not listed can be used too. */
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
  const [filter, setFilter] = useState('');
  const listed = useQuery({
    queryKey: ['branches', ticketId],
    queryFn: () => api.branches(ticketId),
    staleTime: BRANCHES_STALE_MS,
  });
  const needle = filter.trim();
  const branches = (listed.data?.branches ?? []).filter((branch) =>
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
            {typed.includes(branch) ? `Use "${branch}"` : branch}
          </label>
        ))}
      </fieldset>
    </div>
  );
}

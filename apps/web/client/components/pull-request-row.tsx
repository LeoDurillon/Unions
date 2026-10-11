import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactElement } from 'react';

import type { PublicProject, TicketSummary } from '../../src/api-types';
import { api } from '../lib/api';
import { Button, ErrorText, inputClass } from './ui';

function useLinkMutations(ticketId: number): {
  link: ReturnType<
    typeof useMutation<Awaited<ReturnType<typeof api.linkPullRequest>>, Error, string>
  >;
  unlink: ReturnType<typeof useMutation<unknown, Error, void>>;
} {
  const queryClient = useQueryClient();
  const refresh = (): Promise<void> =>
    queryClient.invalidateQueries({ queryKey: ['ticket', ticketId] });
  const link = useMutation({
    mutationFn: (value: string) => api.linkPullRequest(ticketId, value),
    onSuccess: refresh,
  });
  const unlink = useMutation({
    mutationFn: () => api.unlinkPullRequest(ticketId),
    onSuccess: refresh,
  });
  return { link, unlink };
}

function LinkedPullRequest({
  number,
  url,
  warning,
  onUnlink,
  pending,
  error,
}: {
  number: number;
  url: string;
  warning: string | null;
  onUnlink: () => void;
  pending: boolean;
  error: Error | null;
}): ReactElement {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-3 text-sm">
        <span className="text-zinc-500">Pull request</span>
        <a
          className="text-indigo-600 underline dark:text-indigo-400"
          href={url}
          target="_blank"
          rel="noreferrer"
        >
          #{number}
        </a>
        <Button disabled={pending} onClick={onUnlink}>
          Unlink
        </Button>
      </div>
      {warning ? <p className="text-xs text-amber-700 dark:text-amber-400">{warning}</p> : null}
      <ErrorText error={error} />
    </div>
  );
}

/** The ticket's pull request: shown with an Unlink button, or a field to link one by number or URL. */
export function PullRequestRow({
  ticket,
  project,
}: {
  ticket: TicketSummary;
  project: PublicProject;
}): ReactElement {
  const [value, setValue] = useState('');
  const { link, unlink } = useLinkMutations(ticket.id);
  if (ticket.prNumber !== null) {
    return (
      <LinkedPullRequest
        number={ticket.prNumber}
        url={`https://github.com/${project.owner}/${project.repo}/pull/${ticket.prNumber}`}
        warning={link.data?.warning ?? null}
        onUnlink={() => {
          unlink.mutate();
        }}
        pending={unlink.isPending}
        error={unlink.error}
      />
    );
  }
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 text-sm">
        <span className="shrink-0 text-zinc-500">Pull request</span>
        <input
          className={`${inputClass} max-w-xs`}
          placeholder="Number or URL, e.g. 42"
          aria-label="Pull request to link"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            link.reset();
          }}
        />
        <Button
          disabled={value.trim() === '' || link.isPending}
          onClick={() => {
            link.mutate(value);
          }}
        >
          {link.isPending ? 'Checking…' : 'Link'}
        </Button>
      </div>
      <ErrorText error={link.error} />
    </div>
  );
}

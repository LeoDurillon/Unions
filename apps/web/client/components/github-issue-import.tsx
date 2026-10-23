// Fetches an issue of the project's repository, previews it, and creates the ticket on it.
import { useMutation } from '@tanstack/react-query';
import type { PipelineStep } from '@union/core/states';
import { useState, type ReactElement } from 'react';

import type { IssueImport } from '../../src/api-types';
import { api } from '../lib/api';
import { Markdown } from './markdown';
import { Badge, Button, ErrorText, Field, inputClass } from './ui';

function Preview({
  issue,
  creating,
  onCreate,
  onOpen,
}: {
  issue: IssueImport;
  creating: boolean;
  onCreate: () => void;
  onOpen: (ticketId: number) => void;
}): ReactElement {
  const { ticketId } = issue;
  return (
    <div className="space-y-3">
      <div className="max-h-72 space-y-2 overflow-y-auto rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold">
            #{issue.number} {issue.title}
          </h3>
          {issue.state === 'closed' ? <Badge tone="neutral">closed</Badge> : null}
        </div>
        {issue.body.trim() === '' ? (
          <p className="text-sm text-zinc-500">No description.</p>
        ) : (
          <Markdown>{issue.body}</Markdown>
        )}
      </div>
      {ticketId === null ? (
        <>
          <p className="text-xs text-zinc-500">
            The ticket uses this issue: its title and description keep following GitHub.
            {issue.state === 'closed' ? ' The issue is closed.' : ''}
          </p>
          <Button variant="primary" disabled={creating} onClick={onCreate}>
            {creating ? 'Creating…' : 'Create ticket'}
          </Button>
        </>
      ) : (
        <div className="flex items-center gap-3 text-sm">
          <span className="text-amber-700 dark:text-amber-400">
            This issue is already a ticket.
          </span>
          <Button
            onClick={() => {
              onOpen(ticketId);
            }}
          >
            Open ticket
          </Button>
        </div>
      )}
    </div>
  );
}

/** Fetches an issue of the project's repository, previews it, and creates the ticket on it. */
export function GitHubIssueImportPanel({
  projectId,
  flow,
  onCreated,
}: {
  projectId: number;
  flow: PipelineStep[] | null;
  onCreated: (ticketId: number) => void;
}): ReactElement {
  const [issue, setIssue] = useState('');
  const fetchIssue = useMutation({
    mutationFn: () => api.githubIssue.preview(projectId, issue.trim()),
  });
  const create = useMutation({
    mutationFn: () => api.githubIssue.importIssue(projectId, issue.trim(), flow),
    onSuccess: (ticket) => {
      onCreated(ticket.id);
    },
  });
  const found = fetchIssue.data;

  return (
    <div className="space-y-4">
      <Field label="Issue number or URL" hint="An issue of the project's repository.">
        <div className="flex gap-2">
          <input
            className={`${inputClass} font-mono`}
            aria-label="Issue number or URL"
            placeholder="42"
            value={issue}
            onChange={(event) => {
              setIssue(event.target.value);
              fetchIssue.reset();
              create.reset();
            }}
          />
          <Button
            disabled={issue.trim() === '' || fetchIssue.isPending}
            onClick={() => {
              fetchIssue.mutate();
            }}
          >
            {fetchIssue.isPending ? 'Fetching…' : 'Fetch'}
          </Button>
        </div>
      </Field>
      <ErrorText error={fetchIssue.error ?? create.error} />
      {found ? (
        <Preview
          issue={found}
          creating={create.isPending}
          onCreate={() => {
            create.mutate();
          }}
          onOpen={onCreated}
        />
      ) : null}
    </div>
  );
}

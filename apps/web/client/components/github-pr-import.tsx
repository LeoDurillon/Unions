// Fetches an open pull request of the project's repository, previews the ticket it becomes (its issue, the steps Union wrote there, the flow), and creates it.
import { useMutation } from '@tanstack/react-query';
import { stepTitle } from '@union/core/step-titles';
import { useState, type ReactElement } from 'react';

import type { PullRequestImport } from '../../src/api-types';
import { importPullRequest, previewPullRequestImport } from '../lib/pr-import-api';
import { Badge, Button, ErrorText, Field, inputClass } from './ui';

const VALIDATIONS = {
  approved: 'approved',
  pending: 'waiting for you',
  revise: 'revision requested',
} as const;

/** Where the ticket comes from and what it starts with. */
function Summary({ found }: { found: PullRequestImport }): ReactElement {
  const { issue, steps } = found;
  return (
    <div className="space-y-2 rounded-md border border-zinc-200 p-3 text-sm dark:border-zinc-800">
      <div className="flex items-center gap-2">
        <h3 className="font-semibold">
          #{found.number} {found.title}
        </h3>
        {found.draft ? <Badge tone="neutral">draft</Badge> : null}
      </div>
      <p className="font-mono text-xs text-zinc-500">
        {found.headBranch} → {found.baseBranch}
      </p>
      <p>
        {issue
          ? `On issue #${issue.number} ${issue.title}: the ticket takes its title and description.`
          : 'It closes no issue: the ticket takes its title and description.'}
      </p>
      {steps.length > 0 ? (
        <p>
          Union worked on the issue before:{' '}
          {steps
            .map(
              (step) => `${stepTitle(step.step)} v${step.version} ${VALIDATIONS[step.validation]}`,
            )
            .join(', ')}
          .
        </p>
      ) : null}
      <p className="text-xs text-zinc-500">
        Flow: {found.flow.map((step) => stepTitle(step)).join(' → ')}. The ticket waits for your
        approval at Implementation: Approve runs the final review, Revise has the implementer change
        the pull request.
      </p>
    </div>
  );
}

function Outcome({
  found,
  creating,
  onCreate,
  onOpen,
}: {
  found: PullRequestImport;
  creating: boolean;
  onCreate: () => void;
  onOpen: (ticketId: number) => void;
}): ReactElement {
  const { ticketId, refusal } = found;
  if (ticketId !== null) {
    return (
      <div className="flex items-center gap-3 text-sm">
        <span className="text-amber-700 dark:text-amber-400">
          This pull request or its issue is already a ticket.
        </span>
        <Button
          onClick={() => {
            onOpen(ticketId);
          }}
        >
          Open ticket
        </Button>
      </div>
    );
  }
  if (refusal !== null) {
    return <p className="text-sm text-amber-700 dark:text-amber-400">{refusal}.</p>;
  }
  return (
    <Button variant="primary" disabled={creating} onClick={onCreate}>
      {creating ? 'Creating…' : 'Create ticket'}
    </Button>
  );
}

/** The pull request's number or URL, and Fetch. */
function RefField({
  value,
  fetching,
  onChange,
  onFetch,
}: {
  value: string;
  fetching: boolean;
  onChange: (value: string) => void;
  onFetch: () => void;
}): ReactElement {
  return (
    <Field
      label="Pull request number or URL"
      hint="An open pull request of the project's repository."
    >
      <div className="flex gap-2">
        <input
          className={`${inputClass} font-mono`}
          aria-label="Pull request number or URL"
          placeholder="42"
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
        <Button disabled={value.trim() === '' || fetching} onClick={onFetch}>
          {fetching ? 'Fetching…' : 'Fetch'}
        </Button>
      </div>
    </Field>
  );
}

/** Fetches a pull request of the project's repository, previews the ticket, and creates it. */
export function GitHubPullRequestImportPanel({
  projectId,
  onCreated,
}: {
  projectId: number;
  onCreated: (ticketId: number) => void;
}): ReactElement {
  const [pullRequest, setPullRequest] = useState('');
  const fetchPull = useMutation({
    mutationFn: () => previewPullRequestImport(projectId, pullRequest.trim()),
  });
  const create = useMutation({
    mutationFn: () => importPullRequest(projectId, pullRequest.trim()),
    onSuccess: (ticket) => {
      onCreated(ticket.id);
    },
  });
  const found = fetchPull.data;
  return (
    <div className="space-y-4">
      <RefField
        value={pullRequest}
        fetching={fetchPull.isPending}
        onChange={(value) => {
          setPullRequest(value);
          fetchPull.reset();
          create.reset();
        }}
        onFetch={() => {
          fetchPull.mutate();
        }}
      />
      <ErrorText error={fetchPull.error ?? create.error} />
      {found ? (
        <div className="space-y-3">
          <Summary found={found} />
          <Outcome
            found={found}
            creating={create.isPending}
            onCreate={() => {
              create.mutate();
            }}
            onOpen={onCreated}
          />
        </div>
      ) : null}
    </div>
  );
}

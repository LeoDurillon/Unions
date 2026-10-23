// Pulls the linked pull request's unresolved review threads in as draft comments; on a split
// ticket, every open slice's pull request, each onto its slice.
import type { ReactElement } from 'react';

import type { ReviewImportResult, StackImportResult } from '../../../src/api-types';
import { ticketReviewBase } from '../../lib/review-target';
import { useCommits } from '../../lib/use-commits';
import { useImportMutations, useStackImport } from '../../lib/use-review';
import { Button, ErrorText } from '../ui';

function counts(result: ReviewImportResult): string | null {
  const { imported, alreadyImported, resolved } = result;
  if (imported + alreadyImported + resolved === 0) {
    return null;
  }
  const parts = [`${imported} imported`];
  if (alreadyImported > 0) {
    parts.push(`${alreadyImported} already here`);
  }
  if (resolved > 0) {
    parts.push(`${resolved} resolved, skipped`);
  }
  return parts.join(' · ');
}

function summary(result: ReviewImportResult, pullRequest: number): string {
  return counts(result) ?? `No line comments on #${pullRequest}`;
}

/** One line per slice's pull request, bottom first. */
function stackSummary(results: StackImportResult): string[] {
  return results.map((result) => `#${result.number}: ${counts(result) ?? 'no line comments'}`);
}

function ImportButton({
  label,
  pending,
  onImport,
  lines,
  error,
}: {
  label: string;
  pending: boolean;
  onImport: () => void;
  lines: string[];
  error: Error | null;
}): ReactElement {
  return (
    <div className="flex flex-col items-end gap-1">
      <Button disabled={pending} onClick={onImport}>
        {pending ? 'Importing…' : label}
      </Button>
      {lines.map((line) => (
        <p key={line} className="text-xs text-zinc-500">
          {line}
        </p>
      ))}
      <ErrorText error={error} />
    </div>
  );
}

function PullRequestImport({
  ticketId,
  pullRequest,
}: {
  ticketId: number;
  pullRequest: number;
}): ReactElement {
  const { importFromGitHub } = useImportMutations(ticketId, pullRequest);
  return (
    <ImportButton
      label={`Import from #${pullRequest}`}
      pending={importFromGitHub.isPending}
      onImport={() => {
        importFromGitHub.mutate();
      }}
      lines={importFromGitHub.data ? [summary(importFromGitHub.data, pullRequest)] : []}
      error={importFromGitHub.error}
    />
  );
}

function StackImport({ ticketId }: { ticketId: number }): ReactElement {
  const stack = useStackImport(ticketId);
  return (
    <ImportButton
      label="Import from the stack"
      pending={stack.isPending}
      onImport={() => {
        stack.mutate();
      }}
      lines={stack.data ? stackSummary(stack.data) : []}
      error={stack.error}
    />
  );
}

/**
 * Pulls the linked pull request's unresolved review threads in as draft comments; on a split
 * ticket, every open slice's pull request, each onto its slice.
 */
export function ImportComments({
  ticketId,
  pullRequest,
}: {
  ticketId: number;
  pullRequest: number;
}): ReactElement {
  const slices = useCommits(ticketReviewBase(ticketId)).data?.slices ?? [];
  return slices.length > 0 ? (
    <StackImport ticketId={ticketId} />
  ) : (
    <PullRequestImport ticketId={ticketId} pullRequest={pullRequest} />
  );
}

import type { ReactElement } from 'react';

import type { ReviewImportResult } from '../../../src/api-types';
import { useImportMutations } from '../../lib/use-review';
import { Button, ErrorText } from '../ui';

function summary(result: ReviewImportResult, pullRequest: number): string {
  const { imported, alreadyImported, resolved } = result;
  if (imported + alreadyImported + resolved === 0) {
    return `No line comments on #${pullRequest}`;
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

/** Pulls the linked pull request's unresolved review threads in as draft comments. */
export function ImportComments({
  ticketId,
  pullRequest,
}: {
  ticketId: number;
  pullRequest: number;
}): ReactElement {
  const { importFromGitHub } = useImportMutations(ticketId);
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        disabled={importFromGitHub.isPending}
        onClick={() => {
          importFromGitHub.mutate();
        }}
      >
        {importFromGitHub.isPending ? 'Importing…' : `Import from #${pullRequest}`}
      </Button>
      {importFromGitHub.data ? (
        <p className="text-xs text-zinc-500">{summary(importFromGitHub.data, pullRequest)}</p>
      ) : null}
      <ErrorText error={importFromGitHub.error} />
    </div>
  );
}

// An investigation's buttons: Cancel or Run again, Export as Markdown, and Delete.
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import type { Investigation } from '@union/core';
import type { ReactElement } from 'react';

import { api } from '../../lib/api';
import { download } from '../../lib/download';
import { ConfirmButton } from '../confirm-button';
import { Button, ErrorText } from '../ui';
import { investigationFileName, investigationMarkdown } from './investigation-export';
import { isActive } from './investigation-labels';

function useInvestigationActions(
  investigation: Investigation,
  onDeleted: () => void,
): {
  cancel: UseMutationResult<unknown, Error, void>;
  rerun: UseMutationResult<unknown, Error, void>;
  remove: UseMutationResult<unknown, Error, void>;
} {
  const queryClient = useQueryClient();
  const refresh = (): Promise<void> =>
    queryClient.invalidateQueries({ queryKey: ['investigations'] });
  const cancel = useMutation({
    mutationFn: () => api.cancelInvestigation(investigation),
    onSuccess: refresh,
  });
  const rerun = useMutation({
    mutationFn: () => api.rerunInvestigation(investigation),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: () => api.deleteInvestigation(investigation),
    onSuccess: async () => {
      await refresh();
      onDeleted();
    },
  });
  return { cancel, rerun, remove };
}

function exportInvestigation(investigation: Investigation): void {
  const file = new Blob([investigationMarkdown(investigation)], { type: 'text/markdown' });
  download(file, investigationFileName(investigation));
}

/** Cancel or Run again, Export and Delete, with the error of the last one tried. */
export function Actions({
  investigation,
  onDeleted,
}: {
  investigation: Investigation;
  onDeleted: () => void;
}): ReactElement {
  const { status } = investigation;
  const { cancel, rerun, remove } = useInvestigationActions(investigation, onDeleted);
  const busy = cancel.isPending || rerun.isPending || remove.isPending;
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {isActive(status) ? (
          <Button
            disabled={busy}
            onClick={() => {
              cancel.mutate();
            }}
          >
            Cancel
          </Button>
        ) : (
          <Button
            disabled={busy}
            onClick={() => {
              rerun.mutate();
            }}
          >
            Run again
          </Button>
        )}
        <Button
          title="Download every question and answer as a Markdown file"
          onClick={() => {
            exportInvestigation(investigation);
          }}
        >
          Export
        </Button>
        {status === 'running' ? null : (
          <ConfirmButton
            label="Delete"
            question="Delete this investigation and its answers?"
            confirmLabel="Delete for good"
            disabled={busy}
            onConfirm={() => {
              remove.mutate();
            }}
          />
        )}
      </div>
      <ErrorText error={cancel.error ?? rerun.error ?? remove.error} />
    </>
  );
}

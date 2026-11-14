// The project files already uploaded, each with its size, when it changed, and Remove (asks first).

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formatBytes } from '@union/core/attachment-limits';
import type { ReactElement } from 'react';

import type { ProjectFileView } from '../../../src/routes/project-files';
import { projectFilesApi } from '../../lib/settings/project-files-api';
import { formatWhen } from '../../lib/ui/relative-time';
import { ConfirmButton } from '../ui/confirm-button';
import { ErrorText } from '../ui/ui';

/** The uploaded files, or that there is none yet. */
export function FileList({
  projectId,
  files,
}: {
  projectId: number;
  files: ProjectFileView[];
}): ReactElement {
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: (fileId: number) => projectFilesApi.remove(projectId, fileId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['project-files', projectId] }),
  });
  if (files.length === 0) {
    return <p className="text-xs text-zinc-500">No files yet.</p>;
  }
  return (
    <>
      <ul className="divide-y divide-zinc-200 rounded border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
        {files.map((file) => (
          <li key={file.id} className="flex items-center gap-3 px-3 py-1.5">
            <span className="min-w-0 flex-1 truncate font-mono text-xs" title={file.path}>
              {file.path}
            </span>
            <span className="text-xs text-zinc-500">{formatBytes(file.size)}</span>
            <span className="text-xs text-zinc-500">{formatWhen(file.updatedAt)}</span>
            <ConfirmButton
              label="Remove"
              name={`Remove ${file.path}`}
              question="Remove this file?"
              confirmLabel="Remove"
              disabled={remove.isPending}
              onConfirm={() => {
                remove.mutate(file.id);
              }}
            />
          </li>
        ))}
      </ul>
      <ErrorText error={remove.error} />
    </>
  );
}

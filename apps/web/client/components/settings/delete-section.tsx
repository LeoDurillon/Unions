import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { api } from '../../lib/api';
import { Button, ErrorText, inputClass } from '../ui';

/** Typing the repository name to confirm keeps a stray click from deleting a project. */
export function DeleteSection({
  project,
  onDeleted,
}: {
  project: PublicProject;
  onDeleted: () => void;
}): ReactElement {
  const queryClient = useQueryClient();
  const [confirmation, setConfirmation] = useState('');
  const remove = useMutation({
    mutationFn: () => api.deleteProject(project.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
      onDeleted();
    },
  });

  return (
    <section className="space-y-2 rounded-lg border border-red-300 p-3 dark:border-red-900">
      <h3 className="text-sm font-semibold text-red-700 dark:text-red-400">Delete project</h3>
      <p className="text-xs text-zinc-500">
        Removes the project, its tickets and their agent containers from this machine. The GitHub
        issues and the GitHub Project are kept. Type <strong>{project.repo}</strong> to confirm.
      </p>
      <input
        className={inputClass}
        value={confirmation}
        aria-label="Repository name to confirm"
        onChange={(event) => {
          setConfirmation(event.target.value);
        }}
      />
      <ErrorText error={remove.error} />
      <Button
        variant="danger"
        disabled={confirmation !== project.repo || remove.isPending}
        onClick={() => {
          remove.mutate();
        }}
      >
        {remove.isPending ? 'Deleting…' : 'Delete project'}
      </Button>
    </section>
  );
}

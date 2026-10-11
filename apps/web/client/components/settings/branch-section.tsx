import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { api } from '../../lib/api';
import { Button, ErrorText, inputClass } from '../ui';

export function BranchSection({ project }: { project: PublicProject }): ReactElement {
  const queryClient = useQueryClient();
  const [branch, setBranch] = useState(project.config.baseBranch);
  const save = useMutation({
    mutationFn: () => api.updateProject(project.id, { baseBranch: branch.trim() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  });
  const unchanged = branch.trim() === project.config.baseBranch;

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">Base branch</h3>
      <p className="text-xs text-zinc-500">
        New tickets clone this branch. Tickets already started keep their clone.
      </p>
      <div className="flex gap-2">
        <input
          className={inputClass}
          value={branch}
          aria-label="Base branch"
          onChange={(event) => {
            setBranch(event.target.value);
            save.reset();
          }}
        />
        <Button
          disabled={unchanged || branch.trim() === '' || save.isPending}
          onClick={() => {
            save.mutate();
          }}
        >
          Save
        </Button>
      </div>
      <ErrorText error={save.error} />
      {save.isSuccess ? <p className="text-sm text-green-700 dark:text-green-400">Saved.</p> : null}
    </section>
  );
}

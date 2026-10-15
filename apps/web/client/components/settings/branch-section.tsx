// The project settings section for the base branch, saved with the General page's Save.
import type { ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { api } from '../../lib/api';
import { useSettingsForm } from '../../lib/use-settings-form';
import { inputClass } from '../ui';
import { SaveBar } from './save-bar';

export function BranchSection({ project }: { project: PublicProject }): ReactElement {
  const form = useSettingsForm(
    () => project.config.baseBranch,
    (branch) => api.updateProject(project.id, { baseBranch: branch.trim() }),
  );

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">Base branch</h3>
      <p className="text-xs text-zinc-500">
        New tickets clone this branch. Tickets already started keep their clone.
      </p>
      <input
        className={inputClass}
        value={form.value}
        aria-label="Base branch"
        onChange={(event) => {
          form.set(event.target.value);
        }}
      />
      <SaveBar state={form} invalid={form.value.trim() === '' ? 'Name a branch.' : null} />
    </section>
  );
}

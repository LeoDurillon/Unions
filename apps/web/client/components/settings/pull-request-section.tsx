import type { ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { api } from '../../lib/api';
import { useSettingsForm } from '../../lib/use-settings-form';
import { SaveBar } from './save-bar';

/** Whether the worker opens a draft PR after the implementation, or the user links one by hand. */
export function PullRequestSection({ project }: { project: PublicProject }): ReactElement {
  const form = useSettingsForm(
    () => project.config.createPullRequest !== false,
    (createPullRequest) => api.updateProject(project.id, { createPullRequest }),
  );
  const automatic = form.value;

  return (
    <section className="space-y-3">
      <div className="flex items-start gap-3">
        <input
          id="create-pull-request"
          type="checkbox"
          className="mt-1 size-4 accent-indigo-600"
          checked={automatic}
          onChange={(event) => {
            form.set(event.target.checked);
          }}
        />
        <div>
          <label htmlFor="create-pull-request" className="block text-sm font-medium">
            Open a draft pull request automatically
          </label>
          <p className="text-xs text-zinc-500">
            After the implementation, the branch is pushed and a draft pull request (Closes #issue)
            is opened. Approving the final review marks it ready for review.
          </p>
        </div>
      </div>
      <p className="rounded-md bg-zinc-100 p-3 text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
        {automatic
          ? 'A pull request you link by hand on a ticket is always kept: no second one is opened.'
          : 'The branch is still pushed, but no pull request is opened. Link one from the ticket’s Overview tab, by number or URL.'}
      </p>
      <SaveBar state={form} />
    </section>
  );
}

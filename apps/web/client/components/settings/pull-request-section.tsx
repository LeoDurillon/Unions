import type { ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { api } from '../../lib/api';
import { useSettingsForm } from '../../lib/use-settings-form';
import { Switch } from '../choice';
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
      <Switch
        checked={automatic}
        onChange={(on) => {
          form.set(on);
        }}
        hint="After the implementation, the branch is pushed and a draft pull request (Closes #issue) is opened. Approving the final review marks it ready for review."
      >
        <span className="font-medium">Open a draft pull request automatically</span>
      </Switch>
      <p className="rounded-md bg-zinc-100 p-3 text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
        {automatic
          ? 'A pull request you link by hand on a ticket is always kept: no second one is opened.'
          : 'The branch is still pushed, but no pull request is opened. Link one from the ticket’s Overview tab, by number or URL.'}
      </p>
      <SaveBar state={form} />
    </section>
  );
}

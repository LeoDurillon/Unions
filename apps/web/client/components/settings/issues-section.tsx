// Project settings → General: whether new tickets get a GitHub issue, always on while a GitHub Project is connected.
import type { ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { api } from '../../lib/api';
import { hasBoard } from '../../lib/github-project-api';
import { useSettingsForm } from '../../lib/use-settings-form';
import { Switch } from '../choice';
import { SaveBar } from './save-bar';

const HINT =
  'Each ticket gets a GitHub issue with a comment per step, and its pull request closes it. Off, a ticket written in Union or imported from Notion or Jira gets none: its step outputs stay in Union, and reviewers read the agent’s summary in the pull request. A ticket imported from a GitHub issue keeps it. When a tracker is where the team works, off avoids a second copy of each ticket.';

export function IssuesSection({ project }: { project: PublicProject }): ReactElement {
  const board = hasBoard(project);
  const form = useSettingsForm(
    () => board || project.config.mirrorIssues !== false,
    (mirrorIssues) => api.updateProject(project.id, { mirrorIssues }),
  );

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">GitHub issues</h3>
      <Switch
        checked={form.value}
        disabled={board}
        onChange={(on) => {
          form.set(on);
        }}
        hint={HINT}
      >
        <span className="font-medium">Mirror tickets as GitHub issues</span>
      </Switch>
      {board ? (
        <p className="text-xs text-zinc-500">
          Always on while a GitHub Project is connected: its cards are the tickets’ issues.
          Disconnect it under Integrations → GitHub Project to turn this off.
        </p>
      ) : null}
      <SaveBar state={form} />
    </section>
  );
}

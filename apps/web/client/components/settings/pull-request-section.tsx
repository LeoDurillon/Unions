// Whether the worker opens a draft PR after the implementation, or the user links one by hand;
// suggested replies to GitHub comments; stacks.
import type { ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { api } from '../../lib/api';
import { useSettingsForm } from '../../lib/use-settings-form';
import { Switch } from '../choice';
import { SaveBar } from './save-bar';

type PullRequestSettings = {
  createPullRequest: boolean;
  stacks: boolean;
  sliceChecks: boolean;
  suggestReplies: boolean;
};

function settingsOf(project: PublicProject): PullRequestSettings {
  const { config } = project;
  return {
    createPullRequest: config.createPullRequest !== false,
    stacks: config.stacks === true,
    sliceChecks: config.sliceChecks !== false,
    suggestReplies: config.suggestReplies !== false,
  };
}

/** Stacks: Split into a stack in a ticket's PR tab, and whether each slice's checks run. */
function StackSwitches({
  value,
  onChange,
}: {
  value: PullRequestSettings;
  onChange: (value: PullRequestSettings) => void;
}): ReactElement {
  return (
    <>
      <Switch
        checked={value.stacks}
        onChange={(stacks) => {
          onChange({ ...value, stacks });
        }}
        hint="Experimental, while stacks are being built: a ticket's PR tab offers Split into a stack. An agent proposes slices of the spec; once you approve, the history is rewritten into them and a pull request is opened per slice, each on the one below. Merging and restacking the slices is not handled yet: try it on a test repository."
      >
        <span className="font-medium">Split pull requests into stacks</span>
      </Switch>
      {value.stacks ? (
        <Switch
          checked={value.sliceChecks}
          onChange={(sliceChecks) => {
            onChange({ ...value, sliceChecks });
          }}
          hint="Runs the project's checks on each slice's tip when splitting, so each slice builds alone; a failure goes back to the agent."
        >
          <span className="font-medium">Check every slice</span>
        </Switch>
      ) : null}
    </>
  );
}

/** Whether the worker opens a draft PR after the implementation, or the user links one by hand; suggested replies; stacks. */
export function PullRequestSection({ project }: { project: PublicProject }): ReactElement {
  const form = useSettingsForm(
    () => settingsOf(project),
    (value) => api.updateProject(project.id, value),
  );
  const automatic = form.value.createPullRequest;

  return (
    <section className="space-y-3">
      <Switch
        checked={automatic}
        onChange={(on) => {
          form.set({ ...form.value, createPullRequest: on });
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
      <Switch
        checked={form.value.suggestReplies}
        onChange={(suggestReplies) => {
          form.set({ ...form.value, suggestReplies });
        }}
        hint="When you send a review with comments added from GitHub, the implementer drafts a reply to each once its changes are pushed: what it changed and in which commit, or why not. You edit, send or discard each one in the PR tab; nothing is posted until you send it."
      >
        <span className="font-medium">Suggest replies to GitHub comments</span>
      </Switch>
      <StackSwitches
        value={form.value}
        onChange={(value) => {
          form.set(value);
        }}
      />
      <SaveBar state={form} />
    </section>
  );
}

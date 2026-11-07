// The onboarding step that connects a Jira Cloud project with an account's API token.
import type { ReactElement } from 'react';

import type { StepProps } from '../../onboarding/draft';
import { changeTracker, TrackerVerify } from '../tracker-verify';
import { JiraFields, JiraHelp, jiraConfigOf, jiraFormOf } from './jira-fields';

export function JiraStep(props: StepProps): ReactElement {
  const { secret, config } = props.draft.trackers.jira;
  const form = { ...jiraFormOf(config), token: secret };
  return (
    <div className="space-y-4">
      <JiraHelp />
      <JiraFields
        value={form}
        onChange={(value) => {
          changeTracker(props, 'jira', { secret: value.token, config: jiraConfigOf(value) });
        }}
      />
      <TrackerVerify
        kind="jira"
        props={props}
        complete={[form.token, form.site, form.email, form.projectKey].every(
          (v) => v.trim() !== '',
        )}
      />
    </div>
  );
}
